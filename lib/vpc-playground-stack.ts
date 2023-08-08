import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as eventsources from 'aws-cdk-lib/aws-lambda-event-sources';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as path from 'path';

export class VpcPlaygroundStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Create VPC
    const vpc = new ec2.Vpc(this, 'MyVPC', {
      maxAzs: 2, // Default is all AZs in the region
      subnetConfiguration: [
        {
          cidrMask: 24,
          name: 'PrivateSubnet1',
            subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
        },
        {
          cidrMask: 24,
          name: 'PrivateSubnet2',
            subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
        }
 ],
    });

      const inputPrefix = "uploads";
      const outputPrefix = "outputs";

    const s3Bucket =  new s3.Bucket(this, 'VPCPlayground', {
          versioned: true,
          removalPolicy: cdk.RemovalPolicy.DESTROY,  // NOT recommended for production code
      });

      const s3EventSource = new eventsources.S3EventSource(s3Bucket, {
          events: [s3.EventType.OBJECT_CREATED],
          filters: [{ prefix: inputPrefix }],
      })

    // Create Textract Endpoint
    const textractEndpoint = vpc.addInterfaceEndpoint('TextractEndpoint', {
      service: ec2.InterfaceVpcEndpointAwsService.TEXTRACT,
    });

      const lambdaFn = new lambda.DockerImageFunction(this, 'TextractSyncCall', {
          code: lambda.DockerImageCode.fromImageAsset(path.join(__dirname, '../lambda')),
          architecture: lambda.Architecture.ARM_64,
          timeout: cdk.Duration.seconds(15),
          environment: {
              S3_OUTPUT_BUCKET: s3Bucket.bucketName,
              S3_OUTPUT_PREFIX: outputPrefix,
              LOG_LEVEL: "INFO",
          },
          vpc: vpc,
          vpcSubnets: {
              subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
          },
      });

      lambdaFn.addEventSource((s3EventSource));

      lambdaFn.addToRolePolicy(
          new iam.PolicyStatement({
              actions: ["s3:*"],
              resources: ["*"],
          }),
      );

      const lambdaSG = new ec2.SecurityGroup(this, "LambdaSG", {
          allowAllOutbound: false,
          vpc: vpc,
      });

      const endpointSG = new ec2.SecurityGroup(this, "EndpointSG", {
          allowAllOutbound: true,
          vpc: vpc,
      });
      endpointSG.addIngressRule(lambdaSG, ec2.Port.tcp(443));

      const s3VPCEndpoint = vpc.addGatewayEndpoint('S3Endpoint', {
          service: ec2.GatewayVpcEndpointAwsService.S3,
      });

      const lambdaVPCEndpoint = vpc.addInterfaceEndpoint("lambda-endpoint", {
          service: ec2.InterfaceVpcEndpointAwsService.LAMBDA,
          securityGroups: [endpointSG],
          // lookupSupportedAzs: true,
      });
      const cwLogsVPCEndpoint = vpc.addInterfaceEndpoint("cw-logs-endpoint", {
          service: ec2.InterfaceVpcEndpointAwsService.CLOUDWATCH_LOGS,
          securityGroups: [endpointSG],
          // lookupSupportedAzs: true,
      });
      const cwVPCEndpoint = vpc.addInterfaceEndpoint("cw-endpoint", {
          service: ec2.InterfaceVpcEndpointAwsService.CLOUDWATCH,
          securityGroups: [endpointSG],
          // lookupSupportedAzs: true,
      });

      lambdaVPCEndpoint.connections.allowDefaultPortFrom(lambdaFn);
      cwVPCEndpoint.connections.allowDefaultPortFrom(lambdaFn);
      cwLogsVPCEndpoint.connections.allowDefaultPortFrom(lambdaFn);
      textractEndpoint.connections.allowDefaultPortFrom(lambdaFn);

    // Granting lambda access to Textract
    const textractPolicy = new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      resources: ['*'],
      actions: ['textract:*']
    });
    lambdaFn.addToRolePolicy(textractPolicy);

    // Granting lambda access to the VPC Endpoint for S3
    const s3Policy = new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
 // resources: [s3Endpoint.vpcEndpointId],
        resources: ['*'],
      actions: ['s3:*']
    });
    lambdaFn.addToRolePolicy(s3Policy);

      new cdk.CfnOutput(this, 'DocumentUpload', {
          value: `s3://${s3Bucket.bucketName}/${inputPrefix}/`,
      });
  }
}
