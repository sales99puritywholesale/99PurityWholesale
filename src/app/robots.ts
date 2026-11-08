import { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://99puritywholesale.com';
  
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/_next/',
          '/api/',
          '/static/',
          '/client/',
          '/admin/',
          '/login',
          '/auth/',
        ],
      },
      {
        userAgent: ['Google-Extended', 'GPTBot', 'ClaudeBot', 'PerplexityBot', 'anthropic-ai'],
        allow: '/',
        disallow: [
          '/_next/',
          '/api/',
          '/static/',
          '/client/',
          '/admin/',
          '/login',
          '/auth/',
        ],
      }
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
    host: baseUrl,
  };
}
