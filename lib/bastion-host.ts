import * as cdk from 'aws-cdk-lib';
import {Construct} from 'constructs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as iam from 'aws-cdk-lib/aws-iam';

export class BastionHost extends cdk.Stack {
  constructor(scope: Construct,id: string,props?: cdk.StackProps) {
    super(scope,id,props);

    const inputPrefix="uploads";
    const outputPrefix="outputs";

    // Create VPC
    const vpc=new ec2.Vpc(this,'MyVPC',{
      maxAzs: 2,
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

    // Add S3 endpoint
    const vpceS3 = vpc.addGatewayEndpoint('S3Endpoint',{
      service: ec2.GatewayVpcEndpointAwsService.S3,
    });

    // START: S3 Bucket and policy
    const s3Bucket=new s3.Bucket(this,'BastionHostBucket',{
      versioned: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY,  // NOT recommended for production code
    });

    const denyBucketPolicyStatement=new iam.PolicyStatement({
      actions: ['s3:GetObject','s3:ListBucket','s3:PutObject'], // Specify desired actions here
      resources: [s3Bucket.bucketArn+'/*',s3Bucket.bucketArn], // Apply to all objects in the bucket
      effect: iam.Effect.DENY,
      principals: [new iam.ArnPrincipal('*')],
      conditions: {
        'StringNotEquals': {
          'aws:sourceVpce': vpceS3.vpcEndpointId,
          'aws:CalledViaFirst': [ 'textract.amazonaws.com', 'cloudformation.amazonaws.com' ],
        }
      },
    });

    // const allowBucketPolicyStatement=new iam.PolicyStatement({
    //   actions: ['*'], // Specify desired actions here
    //   resources: ['*'], // Apply to all objects in the bucket
    //   effect: iam.Effect.ALLOW,
    //   principals: [new iam.ArnPrincipal('*')],
    // });

    // Attach the bucket policy statement to the bucket
    s3Bucket.addToResourcePolicy(denyBucketPolicyStatement);
    // s3Bucket.addToResourcePolicy(allowBucketPolicyStatement);
    // END: S3 Bucket and policy

    // START: EC2 INSTANCE ROLE
    const instanceRole=new iam.Role(this,'InstanceRole',{
      assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com'),
    });
    instanceRole.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonSSMManagedInstanceCore'));
    // INSTANCE POLICY S3 policy
    const s3Policy=new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      resources: ['*'],
      actions: ['s3:*']
    });
    instanceRole.addToPolicy(s3Policy);
    // END: EC2 INSTANCE ROLE

    // Create SSM endpoint for Bastion Host
    const ssmEndpoint=vpc.addInterfaceEndpoint('SSMEndpoint',{
      service: ec2.InterfaceVpcEndpointAwsService.SSM,
    });
    const ec2MessagesEndpoint=vpc.addInterfaceEndpoint('EC2MessagesEndpoint',{
      service: ec2.InterfaceVpcEndpointAwsService.EC2_MESSAGES,
    });

    const ssmMessagesEndpoint=vpc.addInterfaceEndpoint('SSMMessagesEndpoint',{
      service: ec2.InterfaceVpcEndpointAwsService.SSM_MESSAGES,
    });
    // const ec2Endpoint=vpc.addInterfaceEndpoint('EC2Endpoint',{
    //   service: ec2.InterfaceVpcEndpointAwsService.EC2,
    // });
    // Bastion Host
    // const bastionHost=new ec2.BastionHostLinux(this,'BastionHost',{vpc: vpc,requireImdsv2: true});

    // EC2
    const instanceSecurityGroup=new ec2.SecurityGroup(this,'InstanceSecurityGroup',{
      vpc,
    });

    instanceSecurityGroup.addEgressRule(ec2.Peer.anyIpv4(),ec2.Port.tcp(443));

    const ec2Instance=new ec2.Instance(this,'MyInstance',{
      vpc,
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T2,ec2.InstanceSize.MICRO),
      machineImage: new ec2.AmazonLinuxImage({
        generation: ec2.AmazonLinuxGeneration.AMAZON_LINUX_2,
      }),
      role: instanceRole,
      securityGroup: instanceSecurityGroup,
    });


    // ssmEndpoint.connections.allowDefaultPortFrom(bastionHost);
    // ssmMessagesEndpoint.connections.allowDefaultPortFrom(bastionHost);
    // ec2Endpoint.connections.allowDefaultPortFrom(bastionHost);
    // ec2MessagesEndpoint.connections.allowDefaultPortFrom(bastionHost);
    ssmMessagesEndpoint.connections.allowDefaultPortFrom(ec2Instance);
    ssmEndpoint.connections.allowDefaultPortFrom(ec2Instance);
    // ec2Endpoint.connections.allowDefaultPortFrom(ec2Instance);
    ec2MessagesEndpoint.connections.allowDefaultPortFrom(ec2Instance);


    // OUTPUT CFN
    new cdk.CfnOutput(this,'DocumentUpload',{
      value: `s3://${s3Bucket.bucketName}/${inputPrefix}/`,
    });
  }
}
