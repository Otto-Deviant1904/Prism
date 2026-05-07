import 'dotenv/config';
import { prisma } from './index';
import { slugifyProduct } from '@vogue/shared';

async function main(): Promise<void> {
  const p = {
    brand: 'LAKME',
    name: 'lumi cream',
    volume: '30g',
    shade: undefined
  };

  const product = await prisma.product.upsert({
    where: { slug: slugifyProduct(p) },
    update: {},
    create: {
      slug: slugifyProduct(p),
      brand: p.brand,
      name: p.name,
      volume: p.volume,
      category: 'CREAM',
      imageUrl: 'https://images-static.nykaa.com/media/catalog/product/l/a/lakme-lumi.jpg'
    }
  });

  await prisma.offer.upsert({
    where: { store_externalId: { store: 'NYKAA', externalId: 'nykaa-lumi-30g' } },
    update: { price: 289, inStock: true, rawTitle: 'Lakme Lumi Cream 30g', normalizedTitle: 'lumi cream' },
    create: {
      productId: product.id,
      store: 'NYKAA',
      externalId: 'nykaa-lumi-30g',
      url: 'https://www.nykaa.com/lakme-lumi-cream/p/123456',
      price: 289,
      mrp: 325,
      inStock: true,
      rawTitle: 'Lakme Lumi Cream 30g',
      normalizedTitle: 'lumi cream',
      imageUrl: 'https://images-static.nykaa.com/media/catalog/product/l/a/lakme-lumi.jpg'
    }
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    // eslint-disable-next-line no-console
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
