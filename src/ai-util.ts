import OpenAIApi from 'openai';
import Configuration from 'openai';
import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter';
import { Document } from 'langchain/document';
import { Pinecone, QueryResponse } from '@pinecone-database/pinecone';
import { OpenAI } from 'langchain/llms/openai';
import { loadQAStuffChain } from 'langchain/chains';

const configuration = new Configuration({
  apiKey: process.env.OPENAI_API_KEY,
});
const openai = new OpenAIApi(configuration);

export const embedDocuments = async (texts: string[]): Promise<number[][]> => {
  const response = await openai.embeddings.create({
    model: 'text-embedding-ada-002',
    input: texts,
  });
  return response.data.data.map((embedding) => embedding.embedding);
};

export const embedQuery = async (text: string): Promise<number[]> => {
  const response = await openai.embeddings.create({
    model: 'text-embedding-ada-002',
    input: [text],
  });
  return response.data.data[0].embedding;
};

export const insertDocument = async (index, doc: Document): Promise<void> => {
  const text = doc.pageContent;
  const documentName = doc.metadata.documentName;

  console.log(`${text} text`);
  const textSplitter = new RecursiveCharacterTextSplitter({
    chunkSize: 1000,
  });
  console.log('Splitting text into chunks');
  const chunks = await textSplitter.createDocuments([text]);
  console.log(`${chunks}`);
  const embeddingsArrays = await embedDocuments(
    chunks.map((chunk) => chunk.pageContent.replace(/\n/g, ' '))
  );
  console.log('Inserting chunks into Pinecone');
  const batchSize = 100;
  let batch: any = [];
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const vector = {
      id: `${documentName}_${i}`,
      values: embeddingsArrays[i],
      metadata: {
        ...chunk.metadata,
        loc: JSON.stringify(chunk.metadata.loc),
        pageContent: chunk.pageContent,
        documentName,
      },
    };
    batch.push(vector);

    console.log(`vector ${i} of ${chunks.length} chunks`);

    if (batch.length === batchSize || i === chunks.length - 1) {
      await index.upsert(batch);
      batch = [];
    }
  }
};

export const queryPinecone = async (
  index,
  question: string,
  documentName: string
): Promise<QueryResponse> => {
  const queryEmbedding = await embedQuery(question);

  const queryResponse = await index.query({
    topK: 10,
    vector: queryEmbedding,
    includeMetadata: true,
    includeValues: true,
    filter: { documentName: { $eq: documentName } },
  });

  return queryResponse;
};

export type Source = {
  pageContent: string;
  score: number;
};

export type LLMResponse = {
  result: string;
  sources: Source[];
};

export const queryLLM = async (
  queryResponse: QueryResponse,
  question: string
): Promise<LLMResponse> => {
  const concatenatedPageContent = queryResponse.matches
    .map((match: any) => match.metadata.pageContent)
    .join('');

  // Assuming you still use OpenAI for this part, if not, replace with appropriate LLM call
  const llm = new OpenAI({
    temperature: 0.3,
  });
  const chain = loadQAStuffChain(llm);

  const result = await chain.call({
    input_documents: [new Document({ pageContent: concatenatedPageContent })],
    question: question,
  });

  return {
    result: result.text,
    sources: queryResponse.matches.map((x: any) => ({
      pageContent: x.metadata.pageContent,
      score: x.score,
    })),
  };
};
