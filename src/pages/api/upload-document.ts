import type {NextApiRequest, NextApiResponse} from 'next';
import {Pinecone} from '@pinecone-database/pinecone';
import {Document} from 'langchain/document';
import {insertDocument} from '../../ai-util';

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<{
    success: boolean;
  }>,
) {
  console.log(req.body);
  const { text,name} = JSON.parse(req.body);
console.log(text)
console.log(name)
  const doc = new Document({
    pageContent: text,
    metadata: {documentName: name},
  });
 console.log(doc)
  const client = new Pinecone({apiKey: process.env.PINECONE_API_KEY || '',
    environment: process.env.PINECONE_ENVIRONMENT || ''
  });
  
  const index = client.Index(process.env.PINECONE_INDEX_NAME || '');
  
  try {
    await insertDocument(index, doc);
    res.json({success: true});
  } catch (e) {
    res.json({success: false});
    console.error(e);
  }
}
export default handler;
