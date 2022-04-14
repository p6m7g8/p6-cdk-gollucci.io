import {
  App, Stack, StackProps, Resource, RemovalPolicy,
  aws_s3 as s3,
  aws_cloudfront as cloudfront,
  aws_cloudfront_origins as cfo,
  aws_route53 as route53,
  aws_route53_targets as route53_targets,
  // aws_route53_patterns as route53_patterns,
  aws_certificatemanager as acm,
} from 'aws-cdk-lib';

import { Construct } from 'constructs';

export interface IP6SiteStackProps extends StackProps {
  /**
   * The domain name for the site.
   */
  readonly domainName: string;
}
export class P6StaticSite extends Resource {
  constructor(scope: Construct, id: string, props: IP6SiteStackProps) {
    super(scope, id);

    const wwwDomain: string = `www.${props.domainName}`;

    const zone = route53.HostedZone.fromLookup(this, 'Zone', {
      domainName: props.domainName,
    });

    const websiteBucket = new s3.Bucket(this, wwwDomain, {
      accessControl: s3.BucketAccessControl.PRIVATE,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    const originAccessIdentity = new cloudfront.OriginAccessIdentity(this, 'OriginAccessIdentity');
    websiteBucket.grantRead(originAccessIdentity);

    const certificate = new acm.DnsValidatedCertificate(this, 'Certificate', {
      domainName: wwwDomain,
      subjectAlternativeNames: [props.domainName],
      hostedZone: zone,
    });

    const distribution = new cloudfront.Distribution(this, `${wwwDomain}-distribution`, {
      domainNames: [wwwDomain, props.domainName],
      certificate: certificate,
      enableIpv6: true,
      defaultRootObject: 'index.html',
      defaultBehavior: {
        origin: new cfo.S3Origin(websiteBucket, { originAccessIdentity }),
      },
    });

    const siteAliasRecord = new route53.ARecord(this, 'SiteAAliasRecord', {
      recordName: props.domainName,
      target: route53.RecordTarget.fromAlias(
        new route53_targets.CloudFrontTarget(distribution),
      ),
      zone,
    });
    new route53.AaaaRecord(this, 'SiteAAAARecord', {
      target: route53.RecordTarget.fromAlias(
        new route53_targets.CloudFrontTarget(distribution),
      ),
      zone,
    });

    new route53.CnameRecord(this, 'SiteCnameRecord', {
      recordName: wwwDomain,
      domainName: `${siteAliasRecord.domainName}.`,
      zone,
    });
  }
}
export class MyStack extends Stack {
  constructor(scope: Construct, id: string, props: IP6SiteStackProps) {
    super(scope, id, props);

    new P6StaticSite(this, 'Site', {
      domainName: props.domainName,
    });
  }
}

function main() {
  // for development, use account/region from cdk cli
  const devEnv = {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  };

  const domain: string = 'gollucci.io';

  const app = new App();
  new MyStack(app, 'p6-site-gollucci-io', {
    env: devEnv,
    domainName: domain,
  });
  app.synth();
}

main();
