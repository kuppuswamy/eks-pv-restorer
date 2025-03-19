import * as k from "cdk8s";
import {Chart, ChartProps} from "cdk8s";
import {Construct} from "constructs";
import {Volume} from "@aws-sdk/client-ec2";
import assert from "assert";

interface PersistentVolumesProps extends ChartProps {
  volumes: Volume[];
}

export class PersistentVolumesChart extends Chart {
  constructor(scope: Construct, id: string, props: PersistentVolumesProps) {
    super(scope, id, props);
    props.volumes.forEach((volume: Volume) => {
      const tags = volume.Tags;
      const name = tags?.find(t => t.Key === 'kubernetes.io/created-for/pv/name')?.Value
      const pvcName = tags?.find(t => t.Key === 'kubernetes.io/created-for/pvc/name')?.Value
      const pvcNamespace = tags?.find(t => t.Key === 'kubernetes.io/created-for/pvc/namespace')?.Value
      assert(name);
      assert(pvcName);
      assert(pvcNamespace);
      assert(volume.Size);
      const hyphenSeparatedValues = pvcName.split('-');
      const pvcLabel = hyphenSeparatedValues[2];
      new k.ApiObject(this, name, {
        apiVersion: 'v1',
        kind: 'PersistentVolume',
        metadata: {
          name: name,
          labels: pvcName.endsWith('pgdata') ? {
            'pgo-postgres-cluster': `${pvcNamespace}-${pvcLabel}`
          } : undefined
        },
        spec: {
          accessModes: [
            'ReadWriteOnce'
          ],
          capacity: {
            storage: `${volume.Size}Gi`
          },
          csi: {
            driver: 'ebs.csi.aws.com',
            fsType: 'ext4',
            volumeHandle: volume.VolumeId
          },
          nodeAffinity: {
            required: {
              nodeSelectorTerms: [
                {
                  matchExpressions: [
                    {
                      key: 'topology.ebs.csi.aws.com/zone',
                      operator: 'In',
                      values: [
                        volume.AvailabilityZone
                      ]
                    }
                  ]
                },
              ]
            }
          },
          claimRef: pvcName.endsWith('pgdata') ? null : {
            name: pvcName,
            namespace: pvcNamespace
          }
        }
      });
    });
  }
}