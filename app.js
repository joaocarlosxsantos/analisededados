const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const path = require('path');

const app = express();
const port = 3000;

// Configurar o EJS como motor de templates
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Middleware para servir arquivos estáticos e processar o corpo das requisições
app.use(express.static(path.join(__dirname, 'public')));
app.use(bodyParser.urlencoded({ extended: true }));

// Rota principal
app.get('/', (req, res) => {
    res.render('index', { resultados: null });
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
            console.error(`Erro: ${error.message}`);
            throw error;
        }
    }

    async getPagamentosEDI(data_inicial, data_final) {
        const params = {
            '$filter': `DataPagamento ge ${data_inicial}T00:00:00-03:00 and DataPagamento le ${data_final}T23:59:59-03:00 and AdqId eq 2 and Nsu eq null`
        };
        return this._get('ConsultaPagamento', params);
    }

    async getPagamentosAPI(data_inicial, data_final) {
        const params = {
            '$filter': `DataPagamento ge ${data_inicial}T00:00:00-03:00 and DataPagamento le ${data_final}T23:59:59-03:00 and AdqId eq 2 and Nsu ne null`
        };
    
        try {
            // Supondo que this._get é uma função assíncrona, use await para aguardar sua execução
            const consulta = await this._get('ConsultaPagamento', params);
            console.log(consulta);
            return consulta;
        } catch (error) {
            console.error('Erro ao obter pagamentos:', error);
            throw error;  // Re-throw the error so it can be handled by the caller
        }
    }

    static tratarPagamentosedi(api_valores) {
        if (!api_valores || !api_valores.value) {
            console.log("Nenhum pagamento foi retornado ou ocorreu um erro na consulta.");
            return [];
        }

        return api_valores.value.map(element => {
            const nsu = element['Nsu'];
            const resumovenda = element['ResumoVenda'];
            
            if (nsu === null){
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

app.post('/consultar', async (req, res) => {
    const { data_inicial, data_final, chave_api } = req.body;
    const apiClient = new APIClient('https://api.conciliadora.com.br/api', { 'Authorization': chave_api });

    try {
        const pagamentosedi = await apiClient.getPagamentosEDI(data_inicial, data_final);
        const resultadosprimeiro = APIClient.tratarPagamentosedi(pagamentosedi);
        const pagamentosapi = await apiClient.getPagamentosAPI(data_inicial, data_final);
        const resultados = APIClient.tratarPagamentosapi(pagamentosapi,resultadosprimeiro);
        res.render('index', { resultados });
    } catch (error) {
        res.render('index', { resultados: [] });
        console.log("erro")
    }
});

app.listen(port, () => {
    console.log(`Servidor rodando em http://localhost:${port}`);
});
