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
    res.render('index', { resultadosvalores: null, resultadosduplicidade: null });
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
                    // Se a resposta da API estiver disponível
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
            $select: 'AdqId,RefoId,Empresa,DataPagamento,DataVenda,Nsu,Autorizacao,ResumoVenda,ValorBruto,ValorLiquido,IdTipoTransacao'
        };

        try {
            const consultaAPI = await this._get('ConsultaPagamento', params);
            return consultaAPI;
        } catch (error) {
            console.error('Erro ao obter pagamentos:', error.message);
            throw error;
        }
    }

    static redeEDIduplicado(consultaAPI) {
        return consultaAPI.filter(item => item.AdqId === 2 && item.Nsu === null && item.IdTipoTransacao === 1);
    }

    static redeAPIduplicado(consultaAPI) {
        return consultaAPI.filter(item => item.AdqId === 2 && item.Nsu !== null && item.IdTipoTransacao === 1);
    }
    
    static tratarPagamentos(api_valores) {
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
                const valorb = element['ValorBruto'];
                const valorl = element['ValorLiquido'];
                let status = "Líquido>Bruto";
                
                return {
                    RefoID : element['RefoId'],
                    Empresa: element['Empresa'],
                    DataPagamento: element['DataPagamento'],
                    DataVenda: element['DataVenda'],
                    Nsu: element['Nsu'],
                    Autorizacao: element['Autorizacao'],
                    ValorBruto: valorb,
                    ValorLiquido: valorl,
                    Status: status
                };
            });
    }

    static tratarPagamentosedi(api_valores) {
        if (!api_valores || !api_valores.value) {
            console.log("Nenhum pagamento foi retornado ou ocorreu um erro na consulta.");
            return [];
        }

        return api_valores.value.map(element => {
            const nsu = element['Nsu'];
            const resumovenda = element['ResumoVenda'];
            const idtipotransacao = element['IdTipoTransacao'];

            if (nsu === null && idtipotransacao === 1) {
                return resumovenda;
            }
            
        });
    }

    static tratarPagamentosapi(api_valores, listaronulo) {
        if (!api_valores || !api_valores.value) {
            console.log("Nenhum pagamento foi retornado ou ocorreu um erro na consulta.");
            return [];
        }

        return api_valores.value
            .filter(element => listaronulo.includes(element['ResumoVenda']))
            .map(element => {
                return {
                    id: element['Id'],
                    refo: element['RefoId'],
                    datapagto: element['DataPagamento']
                };
            });
    }
}

app.post('/consultarduplicidade', async (req, res) => {
    const { data_inicial, data_final, chave_api } = req.body;
    const chaveApiTrimmed = chave_api ? chave_api.trim() : '';
    const apiClient = new APIClient('https://api.conciliadora.com.br/api', { 'Authorization': chaveApiTrimmed });

    try {
        const pagamentos = await apiClient.getPagamentos(data_inicial, data_final);
        const pagamentosedi = await apiClient.redeEDIduplicado(pagamentos);
        const resultadosprimeiro = APIClient.tratarPagamentosedi(pagamentosedi);
        const pagamentosapi = await apiClient.redeAPIduplicado(consultaAPI);
        const resultadosduplicidade = APIClient.tratarPagamentosapi(pagamentosapi, resultadosprimeiro);
        res.render('index', { resultadosduplicidade, resultadosvalores: null });
    } catch (error) {
        if (req.timedout) {
            res.status(503).send('O servidor está demorando muito para responder. Tente novamente mais tarde.');
        } else {
            res.render('index', { resultadosduplicidade: [], resultadosvalores: null });
            console.log("erro", error.message);
        }
    }
});

app.post('/analisar', async (req, res) => {
    const { data_inicial, data_final, chave_api } = req.body;
    const chaveApiTrimmed = chave_api ? chave_api.trim() : '';
    const apiClient = new APIClient('https://api.conciliadora.com.br/api', { 'Authorization': chaveApiTrimmed });

    try {
        const pagamentos = await apiClient.getPagamentos(data_inicial, data_final);
        const resultadosvalores = APIClient.tratarPagamentos(pagamentos);
        res.render('index', { resultadosvalores, resultadosduplicidade: null });
    } catch (error) {
        if (req.timedout) {
            res.status(503).send('O servidor está demorando muito para responder. Tente novamente mais tarde.');
        } else {
            res.render('index', { resultadosvalores: [], resultadosduplicidade: null });
            console.log("erro", error.message);
        }
    }
});

app.listen(port, () => {
    console.log(`Servidor rodando em http://localhost:${port}`);
});
