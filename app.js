const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const path = require('path');
const timeout = require('connect-timeout'); // Adicionar o pacote de timeout

const app = express();
const port = 3000;

// Configurar o EJS como motor de templates
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Middleware para servir arquivos estáticos e processar o corpo das requisições
app.use(express.static(path.join(__dirname, 'public')));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(timeout('500s')); // Define um timeout de 120 segundos

// Middleware para tratar requisições que ultrapassaram o tempo limite
app.use((req, res, next) => {
    if (!req.timedout) next();
});

// Rota principal
app.get('/', (req, res) => {
    res.render('index', { resultadosvalores: null});
});

class APIClient {
    constructor(base_url, headers) {
        this.base_url = base_url;
        this.headers = headers;
    }

    async _get(endpoint, params) {
        const url = `${this.base_url}/${endpoint}`;
        try {
            const response = await axios.get(url, { headers: this.headers, params, timeout: 150000 });
            return response.data;
        } catch (error) {
            if (error.code === 'ECONNABORTED') {
                console.error('Erro: Timeout na requisição.');
                throw new Error('Timeout na requisição ao servidor externo.');
            } else {
                console.error(`Erro: ${error.message}`);
                if (error.response) {
                    console.error(`Status: ${error.response.status}`);
                    console.error(`Dados: ${JSON.stringify(error.response.data)}`);
                }
                throw error;
            }
        }
    }

    async getPagamentos(data_inicial, data_final) {
        const params = {
            $filter: `DataPagamento ge ${data_inicial}T00:00:00-03:00 and DataPagamento le ${data_final}T23:59:59-03:00`,
            $select: 'AdqId,Id,RefoId,Empresa,DataPagamento,DataVenda,Nsu,Autorizacao,ResumoVenda,ValorBruto,ValorLiquido,IdTipoTransacao'
        };

        try {
            const consultaAPI = await this._get('ConsultaPagamento', params);
            return consultaAPI;
        } catch (error) {
            console.error('Erro ao obter pagamentos:', error.message);
            throw error;
        }
    }
}

class CasosIdentificados{

    tratarPagamentos(api_valores) {
        if (!api_valores || !api_valores.value) {
            console.log("Nenhum pagamento foi retornado ou ocorreu um erro na consulta.");
            return [];
        }
    
        return api_valores.value
            .filter(element => {
                const valorb = element['ValorBruto'];
                const valorl = element['ValorLiquido'];
                return valorb < valorl && valorb > 0;
            })
            .map(element => {
                return {
                    Id : element['Id'],
                    RefoID : element['RefoId'],
                    Empresa: element['Empresa'],
                    DataPagamento: element['DataPagamento'],
                    DataVenda: element['DataVenda'],
                    Nsu: element['Nsu'],
                    Autorizacao: element['Autorizacao'],
                    ValorBruto: element['ValorBruto'],
                    ValorLiquido: element['ValorLiquido'],
                    Status: "Líquido>Bruto"
                };
            });
    }

}

class RedeApixEdi{

    redeEDIduplicado(consultaAPI) {
        return consultaAPI.value.filter(element => element.AdqId === 2 && element.Nsu === null && element.IdTipoTransacao === 1);
    }

    redeAPIduplicado(consultaAPI) {
        return consultaAPI.value.filter(element => element.AdqId === 2 && element.Nsu !== null && element.IdTipoTransacao === 1);
    }

    tratarPagamentosedi(api_valores) {
        if (!api_valores) {
            console.log("Nenhum pagamento foi retornado ou ocorreu um erro na consulta.");
            return [];
        }

        return api_valores.map(element => {
            const nsu = element['Nsu'];
            const resumovenda = element['ResumoVenda'];
            const idtipotransacao = element['IdTipoTransacao'];

            if (nsu === null && idtipotransacao === 1) {
                return resumovenda;
            }
            
        });
    }

    tratarPagamentosapi(api_valores) {
        if (!api_valores) {
            console.log("Nenhum pagamento foi retornado ou ocorreu um erro na consulta.");
            return [];
        }
        const pagamentosedi = redeEDIduplicado(api_valores);
        const pagamentosapi = redeAPIduplicado(api_valores);
        const listaronulo = tratarPagamentosedi(pagamentosedi);
        return pagamentosapi
            .filter(element => listaronulo.includes(element['ResumoVenda']))
            .map(element => {
                return {
                    Id : element['Id'],
                    RefoID : element['RefoId'],
                    Empresa: element['Empresa'],
                    DataPagamento: element['DataPagamento'],
                    DataVenda: element['DataVenda'],
                    Nsu: element['Nsu'],
                    Autorizacao: element['Autorizacao'],
                    ValorBruto: element['ValorBruto'],
                    ValorLiquido: element['ValorLiquido'],
                    Status: "Registro API duplicado"
                };
            });
    }
}

app.post('/consulta', async (req, res) => {
    const { data_inicial, data_final, chave_api } = req.body;
    const chaveApiTrimmed = chave_api ? chave_api.trim() : '';
    const apiClient = new APIClient('https://api.conciliadora.com.br/api', { 'Authorization': chaveApiTrimmed });
    const redeapixedi = new RedeApixEdi();
    const casosidentificados = new CasosIdentificados();

    try {
        const pagamentos = await apiClient.getPagamentos(data_inicial, data_final);
        //const pagamentosedi = redeapixedi.redeEDIduplicado(pagamentos);
        //const resultadosprimeiro = redeapixedi.tratarPagamentosedi(pagamentosedi);
        //const pagamentosapi = redeapixedi.redeAPIduplicado(pagamentos);
        const resultadosduplicidaderedeediapi = redeapixedi.tratarPagamentosapi(pagamentos);
        const resultadotratamento = casosidentificados.tratarPagamentos(pagamentos);
        const resultadosvalores = resultadosduplicidaderedeediapi.concat(resultadotratamento);
        res.render('index', { resultadosvalores});
    } catch (error) {
        if (req.timedout) {
            res.status(503).send('O servidor está demorando muito para responder. Tente novamente mais tarde.');
        } else {
            res.render('index', { resultadosvalores: []});
            console.log("erro", error.message);
        }
    }
});

app.listen(port, () => {
    console.log(`Servidor rodando em http://localhost:${port}`);
});
