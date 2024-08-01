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
            const response = await axios.get(url, { headers: this.headers, params, timeout: 15000 });
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

    async getPagamentosAPI(data_inicial, data_final,listaronulo) {

        const incrimentoconsulta = "";
        for (let i = 0; i < listaronulo.length; i++) {
            if (i = 0){
                incrimentoconsulta = "ResumoVenda eq '"+lista[i]+"'";
            }
            incrimentoconsulta = " or ResumoVenda eq '"+lista[i]+"'";
                
          }
        
        const params = {
            '$filter': `DataPagamento ge ${data_inicial}T00:00:00-03:00 and DataPagamento le ${data_final}T23:59:59-03:00 and AdqId eq 2 and Nsu ne null and ${incrimentoconsulta}`
        };
        return this._get('ConsultaPagamento', params);
    }

    static tratarPagamentosedi(api_valores) {

        const listaronulo = [];

        if (!api_valores || !api_valores.value) {
            console.log("Nenhum pagamento foi retornado ou ocorreu um erro na consulta.");
            return [];
        }

        return api_valores.value.map(element => {
            const nsu = element['Nsu'];
            const resumovenda = element['ResumoVenda'];
            
            if (nsu = null){
                listaronulo.push(resumovenda);
            }
            return listaronulo;
        });

    }

    static tratarPagamentosapi(api_valores) {

        const listaronulo = [];

        if (!api_valores || !api_valores.value) {
            console.log("Nenhum pagamento foi retornado ou ocorreu um erro na consulta.");
            return [];
        }

        return api_valores.value.map(element => {
            const id = element['Id'];
            const refo = element['RefoId'];
            const datapgamento = element['DataPagamento'];

            return {
                ID: id,
                REFO : refo,
                DataPagamento: datapgamento
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
        const pagamentosapi = await apiClient.getPagamentosEDI(data_inicial, data_final,resultadosprimeiro);
        const resultados = APIClient.tratarPagamentosapi(pagamentosapi);
        res.render('index', { resultados });
    } catch (error) {
        res.render('index', { resultados: [] });
    }
});

app.listen(port, () => {
    console.log(`Servidor rodando em http://localhost:${port}`);
});
