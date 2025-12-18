#!/usr/bin/env node
import 'dotenv/config';
import * as cdk from 'aws-cdk-lib';
import { SmartAssistantStack } from '../lib/smart-assistant-stack.js';
const app = new cdk.App();
new SmartAssistantStack(app, 'SmartAssistantStack', {
    env: {
        account: process.env.CDK_DEFAULT_ACCOUNT,
        region: process.env.CDK_DEFAULT_REGION || 'eu-west-3'
    }
});
