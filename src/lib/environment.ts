export const deployEnvironment = __DEPLOY_ENV__;
export const isStaging = deployEnvironment === 'staging';

export function assertSafeDeploymentOrigin(hostname = window.location.hostname) {
  if (!isStaging) return;
  const allowed = hostname === 'staging.stafinthelab.com'
    || hostname === __STAGING_HOST__
    || hostname === 'localhost'
    || hostname === '127.0.0.1';
  if (!allowed) {
    throw new Error(`staging_build_blocked_on_${hostname}`);
  }
}
