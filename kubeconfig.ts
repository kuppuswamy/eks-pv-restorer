import * as yaml from 'js-yaml';
import {Cluster} from '@aws-sdk/client-eks';
import * as fs from 'fs';

export const createKubeConfig = (cluster: Cluster, roleArn: string) => {
  const kubeConfigYaml = yaml.dump({
    apiVersion: 'v1',
    clusters: [
      {
        cluster: {
          server: cluster.endpoint,
          'certificate-authority-data': cluster.certificateAuthority?.data
        },
        name: cluster.arn
      }
    ],
    contexts: [
      {
        context: {
          cluster: cluster.arn,
          user: cluster.arn
        },
        name: cluster.arn
      }
    ],
    'current-context': cluster.arn,
    kind: 'Config',
    preferences: {},
    users: [
      {
        name: cluster.arn,
        user: {
          exec: {
            apiVersion: 'client.authentication.k8s.io/v1beta1',
            command: '/opt/authenticator/aws-iam-authenticator',
            args: [
              'token',
              '-i',
              cluster.name,
              '--role',
              roleArn
            ]
          }
        }
      }
    ]
  });
  fs.writeFileSync('/tmp/kubeconfig', kubeConfigYaml);
};