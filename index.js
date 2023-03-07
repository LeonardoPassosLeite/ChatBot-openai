const axios = require('axios');
const csv = require('csv-parser');
const fs = require('fs');
const http = require('http');
const url = require('url');
const qs = require('querystring');
const cors = require('cors');
const winston = require('winston');
const util = require('util');
const csvtojson = require('csvtojson');

const csvData = [];

const csvFilePath = 'taesa.csv';

fs.createReadStream(csvFilePath)
  .pipe(csv())
  .on('data', (row) => {
    csvData.push(row);
  })
  .on('end', () => {
    console.log(csvData); // Exibir a matriz com os valores do CSV
  });

const app = http.createServer(async (request, response) => {
  const { pathname, query: params } = url.parse(request.url, true);

  response.setHeader('Access-Control-Allow-Origin', '*');

  if (pathname === '/ask' && params.question) {
    try {
      console.log('Chamando a função askQuestion()');
      const answer = await askQuestion(params.question);
      const responseText = `${answer}`;
      response.end(responseText);
    } catch (error) {
      console.log(error);
      response.statusCode = 500;
      response.end("Não foi possível obter a resposta.");
    }
  } else {
    response.statusCode = 404;
    response.end();
  }
});

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  defaultMeta: { service: 'user-service' },
  transports: [
    new winston.transports.Console({
      format: winston.format.simple(),
    }),
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' }),
  ],
});

const readCSV = util.promisify(csvtojson().fromFile);

async function getCSVData(filePath) {
  return readCSV(filePath);
}


const OPENAI_API_KEY = "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"

const prompt = "Responda à pergunta com a maior sinceridade possível de forma educada usando o texto fornecido e o arquivo csv, se a resposta não estiver contida no texto abaixo, diga 'Não sei'.";
const context = ""


async function askQuestion(question) {
  try {
    const stream = fs.createReadStream('taesa.csv').pipe(csv());

    for await (const item of stream) {
      const { title, heading, content } = item;

      // Fazer a correspondência das palavras-chave com a pergunta
      const words = [title, heading, content].map(text => text.toLowerCase().split(' '));
      const questionWords = question.toLowerCase().split(' ');
      const numMatches = words.reduce((sum, words) => {
        return sum + words.filter(word => questionWords.includes(word)).length;
      }, 0);

      if (numMatches > 0) {
        const content = item.content.trim();

        // Enviar a pergunta para a API do OpenAI
        const response = await axios.post('https://api.openai.com/v1/engines/text-davinci-003/completions', {
          prompt: `${prompt}\n${context}\n${content}\nQ: ${question}\nA:`,
          max_tokens: 2048,
          n: 1,
          temperature: 0.5,
          frequency_penalty: 0.5,
          presence_penalty: 0.5,
          logprobs: 10,
          stop: ""
        }, {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${OPENAI_API_KEY}`
          }
        });

        const answer = response.data.choices[0].text.trim();
        const logprobs = response.data.choices[0].logprobs.token_logprobs;
        const avgLogprob = logprobs.reduce((a, b) => a + b) / logprobs.length;
        console.log(`Resposta: ${answer}, confidence score: ${avgLogprob}`);

        if (answer.toLowerCase() === "não sei") {
          return "Não sei.";
        }
        return answer;
      }
    }

    logger.error("Erro ao chamar API de resposta");
    return "Desculpe, ocorreu um erro ao tentar obter uma resposta.";

  } catch (error) {
    logger.error(`Erro ao chamar API de resposta: ${error}`);
    return "Desculpe, ocorreu um erro ao tentar obter uma resposta.";
  }
}

app.listen(3000, () => {
  console.log('Servidor iniciado na porta 3000');
});