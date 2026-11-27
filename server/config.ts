export type ServerConfig = {
  host: string;
  port: number;
  origins: string[];
  database: string;
  adminToken: string;
  maxRooms: number;
};
export function config(env = process.env): ServerConfig {
  const production = env.NODE_ENV === 'production';
  const origin =
    env.APP_ORIGIN ||
    (env.APP_DOMAIN ? 'https://' + env.APP_DOMAIN : production ? '' : 'http://127.0.0.1:5188');
  if (!origin) throw Error('APP_ORIGIN or APP_DOMAIN is required in production');
  const origins = [origin, ...(env.ALLOWED_ORIGINS || '').split(',').filter(Boolean)].map(
    (value) => {
      const url = new URL(value.trim());
      if (
        !['http:', 'https:'].includes(url.protocol) ||
        url.origin !== value.trim() ||
        (production && url.protocol !== 'https:')
      )
        throw Error('Origins must be exact HTTPS origins in production');
      return url.origin;
    },
  );
  const port = Number(env.PORT || 8787);
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw Error('Invalid PORT');
  return {
    host: env.HOST || '127.0.0.1',
    port,
    origins,
    database: env.DATABASE_PATH || './server-data/skytopia.sqlite',
    adminToken: env.ADMIN_TOKEN || '',
    maxRooms: 12,
  };
}
