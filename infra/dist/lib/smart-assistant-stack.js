import * as cdk from 'aws-cdk-lib';
import * as nodeLambda from 'aws-cdk-lib/aws-lambda-nodejs';
import { Runtime } from 'aws-cdk-lib/aws-lambda';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as sm from 'aws-cdk-lib/aws-secretsmanager';
import * as apigwv2 from 'aws-cdk-lib/aws-apigatewayv2';
import * as integrations from 'aws-cdk-lib/aws-apigatewayv2-integrations';
export class SmartAssistantStack extends cdk.Stack {
    constructor(scope, id, props) {
        super(scope, id, props);
        // ✅ 引用已存在的 Secret（不要再新建）
        const openAiSecret = sm.Secret.fromSecretNameV2(this, 'OpenAIKey', 'SMART_ASSISTANT_OPENAI_KEY');
        const analyzeFn = new nodeLambda.NodejsFunction(this, 'AnalyzeFn', {
            entry: '../backend/index.ts',
            handler: 'handler',
            runtime: Runtime.NODEJS_20_X,
            memorySize: 1024,
            timeout: cdk.Duration.seconds(30),
            environment: {
                OPENAI_SECRET_ID: openAiSecret.secretArn,
            },
        });
        // S3 bucket to store uploaded screenshots/images for vision
        const screenshotsBucket = new s3.Bucket(this, 'ScreenshotsBucket', {
            blockPublicAccess: s3.BlockPublicAccess.BLOCK_ACLS,
            publicReadAccess: false,
        });
        // Allow API clients to read images via presigned URLs only; Lambda needs
        // permission to write objects.
        screenshotsBucket.grantPut(analyzeFn);
        // Pass bucket name to Lambda
        analyzeFn.addEnvironment('SCREENSHOTS_BUCKET', screenshotsBucket.bucketName);
        // ✅ 一樣授權 Lambda 讀取
        openAiSecret.grantRead(analyzeFn);
        const httpApi = new apigwv2.HttpApi(this, 'Api', {
            apiName: 'smart-assistant-api',
            corsPreflight: {
                allowHeaders: ['*'],
                allowMethods: [apigwv2.CorsHttpMethod.ANY],
                allowOrigins: ['*'],
            },
        });
        httpApi.addRoutes({
            path: '/analyze',
            methods: [apigwv2.HttpMethod.POST],
            integration: new integrations.HttpLambdaIntegration('AnalyzeIntegration', analyzeFn),
        });
        new cdk.CfnOutput(this, 'HttpApiUrl', { value: httpApi.apiEndpoint });
    }
}
