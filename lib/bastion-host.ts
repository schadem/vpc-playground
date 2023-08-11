import * as cdk from 'aws-cdk-lib';
import {Construct} from 'constructs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as iam from 'aws-cdk-lib/aws-iam';

export class BastionHost extends cdk.Stack {
  constructor(scope: Construct,id: string,props?: cdk.StackProps) {
    super(scope,id,props);

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

    // INSTANCE ROLE
    const instanceRole=new iam.Role(this,'InstanceRole',{
      assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com'),
    });

    instanceRole.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonSSMManagedInstanceCore'));

    // S3 policy
    const s3Policy=new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      resources: ['*'],
      actions: ['s3:*']
    });

    instanceRole.addToPolicy(s3Policy);

    // Add S3 endpoint
    vpc.addGatewayEndpoint('S3Endpoint',{
      service: ec2.GatewayVpcEndpointAwsService.S3,
    });
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
  }
}
