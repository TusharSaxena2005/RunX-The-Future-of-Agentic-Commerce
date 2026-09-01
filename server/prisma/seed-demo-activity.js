import { PrismaClient } from '../generated/client/index.js';

const prisma = new PrismaClient();

const DAY = 24 * 60 * 60 * 1000;
const customerNames = [
  'Aarav Mehta', 'Diya Sharma', 'Kabir Singh', 'Ananya Iyer',
  'Rohan Gupta', 'Meera Nair', 'Arjun Patel', 'Ishita Verma',
  'Vivaan Rao', 'Sara Khan', 'Aditya Joshi', 'Nisha Kapoor'
];

const orderPlans = [
  [29, 'DIRECT', [['Nike Revolution 7', 1]]],
  [27, 'DIRECT', [['Adidas Duramo', 1], ['Running Socks', 1]]],
  [25, 'DIRECT', [['Running T-Shirt', 1]]],
  [23, 'DIRECT', [['Nike Revolution 7', 1], ['Sports Bottle', 1]]],
  [21, 'DIRECT', [['Running Socks', 2]]],
  [19, 'DIRECT', [['Sports Watch', 1]]],
  [17, 'DIRECT', [['Adidas Duramo', 1]]],
  [15, 'AI_AGENT', [['Nike Revolution 7', 1], ['Running Socks', 1]]],
  [13, 'AI_AGENT', [['Running T-Shirt', 1], ['Running Socks', 1]]],
  [11, 'AI_AGENT', [['Adidas Duramo', 1], ['Running Socks', 2]]],
  [9, 'AI_AGENT', [['Nike Revolution 7', 1], ['Sports Bottle', 1]]],
  [7, 'AI_AGENT', [['Sports Watch', 1], ['Sports Bottle', 1]]],
  [5, 'AI_AGENT', [['Nike Revolution 7', 1], ['Running Socks', 2]]],
  [3, 'AI_AGENT', [['Running T-Shirt', 2], ['Sports Bottle', 1]]],
  [1, 'AI_AGENT', [['Adidas Duramo', 1], ['Running Socks', 1]]]
];

async function main() {
  const merchant = await prisma.merchant.findFirst({ orderBy: { createdAt: 'asc' } });
  if (!merchant) throw new Error('No merchant found. Run npm run db:seed first.');

  const products = await prisma.product.findMany({ where: { merchantId: merchant.id } });
  const byName = Object.fromEntries(products.map((product) => [product.name, product]));
  const missing = [...new Set(orderPlans.flatMap(([, , items]) => items.map(([name]) => name)))]
    .filter((name) => !byName[name]);
  if (missing.length) throw new Error(`Missing products: ${missing.join(', ')}`);

  const marker = '@demo.runx.test';
  const existing = await prisma.customer.count({ where: { email: { endsWith: marker } } });
  if (existing) {
    throw new Error('Demo activity already exists. Clear demo activity before seeding it again.');
  }

  const customers = [];
  for (const [index, name] of customerNames.entries()) {
    customers.push(await prisma.customer.create({
      data: {
        name,
        email: `${name.toLowerCase().replace(/[^a-z]+/g, '.').replace(/^\.|\.$/g, '')}${marker}`
      }
    }));
  }

  let paidRevenue = 0;
  let paidOrders = 0;
  for (const [index, [daysAgo, channel, items]] of orderPlans.entries()) {
    const customer = customers[index % customers.length];
    const createdAt = new Date(Date.now() - daysAgo * DAY - (index % 5) * 37 * 60 * 1000);
    const subtotal = items.reduce((sum, [name, quantity]) => sum + byName[name].price * quantity, 0);
    const discount = channel === 'AI_AGENT' && subtotal >= 4000 ? Math.min(300, Math.round(subtotal * 0.05)) : 0;
    const total = subtotal - discount;
    const upsellRevenue = channel === 'AI_AGENT'
      ? items.slice(1).reduce((sum, [name, quantity]) => sum + byName[name].price * quantity, 0)
      : 0;

    const order = await prisma.order.create({
      data: {
        merchantId: merchant.id,
        customerId: customer.id,
        subtotal,
        discount,
        total,
        status: 'PAID',
        razorpayOrderId: `order_demo_${String(index + 1).padStart(3, '0')}`,
        createdAt,
        items: {
          create: items.map(([name, quantity]) => ({
            productId: byName[name].id,
            quantity,
            unitPrice: byName[name].price
          }))
        },
        payments: {
          create: {
            razorpayPaymentId: `pay_demo_${String(index + 1).padStart(3, '0')}`,
            razorpaySignature: 'demo_signature_not_for_production',
            amount: total,
            status: 'CAPTURED',
            createdAt,
            updatedAt: createdAt
          }
        }
      }
    });

    await prisma.salesEvent.create({
      data: {
        merchantId: merchant.id,
        timestamp: createdAt,
        orderId: order.id,
        channel,
        revenue: total,
        aov: total,
        aiAttributed: channel === 'AI_AGENT',
        upsellRevenue,
        converted: true
      }
    });

    await prisma.agentAction.create({
      data: {
        merchantId: merchant.id,
        sessionId: `demo-order-${index + 1}`,
        timestamp: createdAt,
        actor: channel === 'AI_AGENT' ? 'AI_AGENT' : 'CUSTOMER',
        action: 'CREATE_ORDER',
        input: { itemCount: items.reduce((sum, [, quantity]) => sum + quantity, 0), demo: true },
        output: { orderId: order.id, total, channel },
        amount: total,
        reason: 'Synthetic hackathon demo activity',
        status: 'SUCCESS'
      }
    });

    paidOrders += 1;
    paidRevenue += total;
  }

  const abandonedPlans = [
    ['Running Socks', 2, 6],
    ['Sports Watch', 1, 4],
    ['Nike Revolution 7', 1, 2]
  ];
  for (const [index, [name, quantity, daysAgo]] of abandonedPlans.entries()) {
    const createdAt = new Date(Date.now() - daysAgo * DAY);
    await prisma.cart.create({
      data: {
        merchantId: merchant.id,
        customerId: customers[(index + 3) % customers.length].id,
        sessionId: `demo-abandoned-${index + 1}`,
        createdAt,
        abandonedAt: new Date(createdAt.getTime() + 2 * 60 * 60 * 1000),
        items: {
          create: {
            productId: byName[name].id,
            quantity,
            unitPrice: byName[name].price
          }
        }
      }
    });
  }

  console.log(JSON.stringify({
    label: 'Synthetic hackathon demo activity',
    customers: customers.length,
    paidOrders,
    capturedPayments: paidOrders,
    salesEvents: paidOrders,
    abandonedCarts: abandonedPlans.length,
    paidRevenue
  }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
