const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const path = require('path');
const timeout = require('connect-timeout'); 
const app = express();
const port = 3000;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(timeout('500s'));

app.use((req, res, next) => {
    if (!req.timedout) next();
});

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
            $select: 'AdqId,Adquirente,Id,RefoId,Empresa,DataPagamento,DataVenda,Nsu,Autorizacao,ResumoVenda,ValorBruto,ValorLiquido,IdTipoTransacao'
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

    gerararraysemid(consultaAPI) {
        return consultaAPI.value.map(({ Id, ...restante }) => restante);
    }

    liquidomaiorquebruto(api_valores) {
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
                    Adquirente : element['Adquirente'],
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

    listarduplicidades(api_valores) {
        if (!api_valores) {
            console.log("Nenhum pagamento foi retornado ou ocorreu um erro na consulta.");
            return [];
        }
        return api_valores.value.filter(element => {
            const valorb = parseFloat(element['ValorBruto']);
            const valorl = parseFloat(element['ValorLiquido']);
            if(valorb > 0 && valorl > 0){
                return
            }
        })
        .filter((item, index, self) => self.findIndex(t => (
            t.RefoId === item.RefoId && 
            t.Empresa === item.Empresa && 
            t.DataPagamento === item.DataPagamento && 
            t.DataVenda === item.DataVenda && 
            t.Nsu === item.Nsu && 
            t.Autorizacao === item.Autorizacao &&
            t.ValorBruto === item.ValorBruto &&
            t.ValorLiquido === item.ValorLiquido &&
            t.IdTipoTransacao === item.IdTipoTransacao
        )) !== index)
        .map(element => {
            return {
                Id: element['Id'],
                RefoID: element['RefoId'],
                Adquirente : element['Adquirente'],
                Empresa: element['Empresa'],
                DataPagamento: element['DataPagamento'],
                DataVenda: element['DataVenda'],
                Nsu: element['Nsu'],
                Autorizacao: element['Autorizacao'],
                ValorBruto: element['ValorBruto'],
                ValorLiquido: element['ValorLiquido'],
                Status: "Registro Duplicado"
            };
        });
    }

    todososcasos(api_valores){
        const liquidomaiorquebruto = this.liquidomaiorquebruto(api_valores);
        const duplicidades = this.listarduplicidades(api_valores);
        return liquidomaiorquebruto.concat(duplicidades);
    }

}

class RedeApixEdi{

    listarREDEsemNSU(consultaAPI) {
        return consultaAPI.value.filter(element => element.AdqId === 2 && element.Nsu === null && element.IdTipoTransacao === 1);
    }

    listarREDEcomNSU(consultaAPI) {
        return consultaAPI.value.filter(element => element.AdqId === 2 && element.Nsu !== null && element.IdTipoTransacao === 1);
    }

    listarROsemNSU(api_valores) {
        if (!api_valores) {
            console.log("Nenhum pagamento foi retornado ou ocorreu um erro na consulta.");
            return [];
        }

        return api_valores.map(element => {
            const nsu = element['Nsu'];
            const resumovenda = element['ResumoVenda'];
            const idtipotransacao = element['IdTipoTransacao'];
            const datapagamento = element['DataPagamento'];

            if (nsu === null && idtipotransacao === 1) {
                return resumovenda,datapagamento;
            }
            
        });
    }

    duplicidadesapixedi(api_valores) {
        if (!api_valores) {
            console.log("Nenhum pagamento foi retornado ou ocorreu um erro na consulta.");
            return [];
        }

        const pagamentosedi = this.listarREDEsemNSU(api_valores);
        const pagamentosapi = this.listarREDEcomNSU(api_valores);
        const listaronulo = this.listarROsemNSU(pagamentosedi);
        return pagamentosapi
            .filter(element => listaronulo.includes(element['ResumoVenda'],element['DataPagamento']))
            .map(element => {
                return {
                    Id : element['Id'],
                    RefoID : element['RefoId'],
                    Adquirente : element['Adquirente'],
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
        const resultadosduplicidaderedeediapi = redeapixedi.duplicidadesapixedi(pagamentos);
        const resultadotratamento = casosidentificados.todososcasos(pagamentos);
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
