import 'reflect-metadata';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import { ApolloServer } from '@apollo/server';
import { expressMiddleware } from '@as-integrations/express5';

import { typeDefs } from './graphql/typeDefs';
import { resolvers } from './graphql/resolvers';
import { GraphQLContext } from './types';
import { extractUserFromRequest } from './authUtility/authmiddleware';

dotenv.config();

export async function createApp() {
  const app = express();

  app.use(express.json());
  app.use(cookieParser());

  app.use(
    cors({
      origin: process.env.CLIENT_ORIGIN ?? 'http://localhost:5173',
      credentials: true
    })
  );

  const apolloServer = new ApolloServer({
    typeDefs,
    resolvers
  });

  await apolloServer.start();

  app.use(
    '/graphql',
    expressMiddleware(apolloServer, {
      context: async ({ req, res }): Promise<GraphQLContext> => ({
        req,
        res,
        user: extractUserFromRequest(req)
      })
    })
  );

  return app;
}
