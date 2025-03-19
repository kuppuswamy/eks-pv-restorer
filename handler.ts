import {CdkCustomResourceEvent, CdkCustomResourceResponse, Context} from 'aws-lambda';
import {DescribeVolumesCommand, DescribeVolumesCommandOutput, EC2Client} from '@aws-sdk/client-ec2';
import {App} from "cdk8s";
import {PersistentVolumesChart} from "./pv-chart";
import assert from "assert";
import {execa} from 'execa';
import {DescribeClusterCommand, DescribeClusterCommandOutput, EKSClient} from "@aws-sdk/client-eks";
import {createKubeConfig} from "./kubeconfig";

interface Config {
  clusterName: string;
  namespaces: string[];
  roleArn: string;
}

process.env.PATH = `/opt/kubectl:/opt/authenticator:${process.env.PATH}`;

const ec2Client = new EC2Client({});
const eksClient = new EKSClient({});

const describeVolumes = async (config: Config, nextToken?: string): Promise<DescribeVolumesCommandOutput> => {
  return await ec2Client.send(new DescribeVolumesCommand({
    Filters: [{
      Name: 'tag:KubernetesCluster',
      Values: [config.clusterName]
    }, {
      Name: 'tag:kubernetes.io/created-for/pvc/namespace',
      Values: config.namespaces
    }],
    MaxResults: 10,
    NextToken: nextToken
  }));
};

const describeCluster = async (config: Config): Promise<DescribeClusterCommandOutput> => {
  return await eksClient.send(new DescribeClusterCommand({
    name: config.clusterName
  }));
};

const toConfig = (resourceProperties: { ServiceToken: string; [Key: string]: any; }): Config => {
  return {
    clusterName: resourceProperties.clusterName,
    namespaces: resourceProperties.namespaces,
    roleArn: resourceProperties.roleArn
  }
};

export const handler = async (event: CdkCustomResourceEvent, context: Context): Promise<CdkCustomResourceResponse> => {
  console.log("REQUEST RECEIVED:\n" + JSON.stringify(event));
  const config: Config = toConfig(event.ResourceProperties);
  if (event.RequestType !== 'Create') {
    return {Data: {Status: 'NOT_MODIFIED'}};
  }
  const cluster = await describeCluster(config);
  assert(cluster.cluster);
  createKubeConfig(cluster.cluster, config.roleArn);
  let volumes: DescribeVolumesCommandOutput = await describeVolumes(config);
  while (volumes.NextToken) {
    volumes = await describeVolumes(config, volumes.NextToken);
    assert(volumes.Volumes);
    if (volumes.Volumes.length === 0)
      continue;
    const app = new App();
    new PersistentVolumesChart(app, 'PersistentVolumes', {
      volumes: volumes.Volumes,
    });
    const manifest = app.synthYaml();
    await execa('kubectl', ['apply', '--kubeconfig', '/tmp/kubeconfig', '-f', '-'], {input: manifest});
    console.log(manifest);
  }
  return {Data: {Status: 'OK'}};
};