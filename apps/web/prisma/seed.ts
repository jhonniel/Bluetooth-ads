/**
 * Seeds an administrator, default settings and (optionally) realistic sample data for development.
 *
 * Sample analytics events are tagged with appVersion "seed-sample" so they can be identified and
 * removed. Stations are seeded without heartbeats or advertising state: only a real Windows agent
 * can report that a station is online or advertising.
 */
import { createHmac, randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { PrismaClient, type AdvertisingEventType, type CampaignStatus, type Prisma } from "@prisma/client";

const prisma = new PrismaClient();
const SAMPLE_TAG = "seed-sample";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} must be set to run the seed.`);
  return value;
}

function seededRandom(seed: number) {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

async function seedUsers() {
  const email = (process.env.SEED_ADMIN_EMAIL ?? "admin@example.com").toLowerCase();
  const password = requireEnv("SEED_ADMIN_PASSWORD");
  const passwordHash = await bcrypt.hash(password, 12);

  const admin = await prisma.user.upsert({
    where: { email },
    create: { email, name: "System Administrator", role: "ADMIN", passwordHash },
    update: {},
  });

  if (process.env.SEED_SAMPLE_DATA !== "false") {
    for (const user of [
      { email: "manager@example.com", name: "Maria Santos", role: "MANAGER" as const },
      { email: "viewer@example.com", name: "John Reyes", role: "VIEWER" as const },
    ]) {
      await prisma.user.upsert({ where: { email: user.email }, create: { ...user, passwordHash }, update: {} });
    }
  }
  return admin;
}

async function seedSettings() {
  await prisma.systemSettings.upsert({
    where: { id: 1 },
    create: { id: 1, organizationName: "Demo Retail Group", timezone: "Asia/Manila" },
    update: {},
  });
  await prisma.notificationSettings.upsert({ where: { id: 1 }, create: { id: 1 }, update: {} });
}

async function seedSampleData(adminId: number) {
  if ((await prisma.campaign.count()) > 0) {
    console.log("Campaigns already exist; skipping sample data.");
    return;
  }
  const deviceSecret = requireEnv("DEVICE_TOKEN_SECRET");
  const now = new Date();
  const day = 86_400_000;

  const ads = await Promise.all(
    [
      {
        name: "Welcome Offer",
        title: "Welcome to Our Store!",
        message: "Enjoy 10% OFF your next purchase. Visit us today!",
        description: "Show this notification at any cashier to get 10% off your total purchase. Valid once per customer per day.",
        landingUrl: "https://example.com/promotions/welcome",
        ctaLabel: "View Promotion",
      },
      {
        name: "Weekend Flash Sale",
        title: "Weekend Flash Sale is on",
        message: "Up to 40% off selected electronics this weekend only.",
        description: "While supplies last. Selected items only.",
        landingUrl: "https://example.com/promotions/weekend-flash",
        ctaLabel: "Shop the Sale",
      },
      {
        name: "Coffee Bar Happy Hour",
        title: "Happy Hour at the Coffee Bar",
        message: "Buy one, get one free on all iced drinks from 2-5 PM.",
        description: "Available at participating coffee bar counters.",
        landingUrl: "https://example.com/promotions/happy-hour",
        ctaLabel: "See Menu",
      },
      {
        name: "Double Loyalty Points",
        title: "Earn double points today",
        message: "Scan your loyalty card to earn 2x points on every purchase.",
        description: null,
        landingUrl: "https://example.com/loyalty",
        ctaLabel: "Learn More",
      },
      {
        name: "Holiday Collection Teaser",
        title: "The Holiday Collection is here",
        message: "Be the first to see this season's gift ideas in store.",
        description: null,
        landingUrl: "https://example.com/holiday",
        ctaLabel: "Preview",
      },
    ].map((data) => prisma.advertisement.create({ data })),
  );

  const stations = await Promise.all(
    [
      { name: "Makati Flagship - Main Entrance", stationCode: "STN-MKT01", location: "Makati Flagship Store" },
      { name: "BGC High Street - Kiosk", stationCode: "STN-BGC01", location: "BGC High Street Branch" },
      { name: "Cebu IT Park - Lobby", stationCode: "STN-CEB01", location: "Cebu IT Park Branch" },
      { name: "Davao Abreeza - Atrium", stationCode: "STN-DVO01", location: "Abreeza Mall, Davao" },
    ].map((data) => prisma.bluetoothStation.create({ data: { ...data, beaconIdentifier: randomUUID() } })),
  );
  const [mkt, bgc, ceb, dvo] = stations as [typeof stations[number], typeof stations[number], typeof stations[number], typeof stations[number]];
  const [welcome, flash, coffee, loyalty, holiday] = ads as [typeof ads[number], typeof ads[number], typeof ads[number], typeof ads[number], typeof ads[number]];

  const campaignDefs: {
    name: string;
    description: string;
    status: CampaignStatus;
    advertisementId: number;
    startAt: Date | null;
    endAt: Date | null;
    priority: number;
    cooldownMinutes: number | null;
    maxNotificationsPerDay: number | null;
    stationIds: number[];
    traffic: number;
  }[] = [
    {
      name: "Store Welcome - Q4",
      description: "Always-on welcome discount for walk-in customers.",
      status: "ACTIVE",
      advertisementId: welcome.id,
      startAt: new Date(now.getTime() - 45 * day),
      endAt: new Date(now.getTime() + 60 * day),
      priority: 40,
      cooldownMinutes: null,
      maxNotificationsPerDay: null,
      stationIds: [mkt.id, bgc.id, ceb.id, dvo.id],
      traffic: 1,
    },
    {
      name: "Coffee Bar Happy Hour",
      description: "Afternoon traffic booster for coffee bar locations.",
      status: "ACTIVE",
      advertisementId: coffee.id,
      startAt: new Date(now.getTime() - 20 * day),
      endAt: new Date(now.getTime() + 25 * day),
      priority: 70,
      cooldownMinutes: 120,
      maxNotificationsPerDay: 1,
      stationIds: [mkt.id, bgc.id],
      traffic: 0.7,
    },
    {
      name: "Weekend Electronics Flash Sale",
      description: "Two-day flash sale on selected electronics.",
      status: "SCHEDULED",
      advertisementId: flash.id,
      startAt: new Date(now.getTime() + 3 * day),
      endAt: new Date(now.getTime() + 5 * day),
      priority: 90,
      cooldownMinutes: 240,
      maxNotificationsPerDay: 2,
      stationIds: [mkt.id, ceb.id],
      traffic: 0,
    },
    {
      name: "Double Loyalty Points",
      description: "Paused pending loyalty system maintenance.",
      status: "PAUSED",
      advertisementId: loyalty.id,
      startAt: new Date(now.getTime() - 28 * day),
      endAt: new Date(now.getTime() + 30 * day),
      priority: 55,
      cooldownMinutes: null,
      maxNotificationsPerDay: null,
      stationIds: [ceb.id, dvo.id],
      traffic: 0.5,
    },
    {
      name: "Back-to-School Promo",
      description: "Ended seasonal campaign.",
      status: "EXPIRED",
      advertisementId: welcome.id,
      startAt: new Date(now.getTime() - 60 * day),
      endAt: new Date(now.getTime() - 12 * day),
      priority: 60,
      cooldownMinutes: 180,
      maxNotificationsPerDay: 1,
      stationIds: [bgc.id, dvo.id],
      traffic: 0.6,
    },
    {
      name: "Holiday Collection Launch",
      description: "Draft for the upcoming holiday season.",
      status: "DRAFT",
      advertisementId: holiday.id,
      startAt: new Date(now.getTime() + 20 * day),
      endAt: new Date(now.getTime() + 55 * day),
      priority: 80,
      cooldownMinutes: null,
      maxNotificationsPerDay: null,
      stationIds: [mkt.id, bgc.id, ceb.id, dvo.id],
      traffic: 0,
    },
  ];

  const random = seededRandom(20261103);
  const devices = Array.from({ length: 600 }, () => createHmac("sha256", deviceSecret).update(randomUUID()).digest("hex"));
  const events: Prisma.AdvertisingEventCreateManyInput[] = [];

  for (const def of campaignDefs) {
    const { stationIds, traffic, ...data } = def;
    const campaign = await prisma.campaign.create({ data: { ...data, createdById: adminId } });
    await prisma.campaignStation.createMany({ data: stationIds.map((stationId) => ({ campaignId: campaign.id, stationId })) });
    if (traffic === 0) continue;

    // Paused campaigns stopped serving 6 days ago.
    const activeUntil = def.status === "PAUSED" ? now.getTime() - 6 * day : Math.min(now.getTime(), def.endAt?.getTime() ?? now.getTime());
    for (let d = 29; d >= 0; d--) {
      const dayStart = now.getTime() - (d + 1) * day;
      if (def.startAt && dayStart < def.startAt.getTime() - day) continue;
      if (dayStart > activeUntil) continue;
      const weekday = new Date(dayStart).getUTCDay();
      const weekendBoost = weekday === 0 || weekday === 6 ? 1.35 : 1;
      for (const stationId of stationIds) {
        const detections = Math.round((60 + random() * 90) * traffic * weekendBoost);
        for (let i = 0; i < detections; i++) {
          const at = new Date(dayStart + Math.floor(random() * day));
          if (at.getTime() > activeUntil) continue;
          const device = devices[Math.floor(random() * devices.length)]!;
          const rssi = -50 - Math.floor(random() * 40);
          const base = { campaignId: campaign.id, stationId, anonymousDeviceToken: device, rssi, platform: "android", appVersion: SAMPLE_TAG };
          events.push({ ...base, eventType: "beacon_detected" as AdvertisingEventType, occurredAt: at });
          if (rssi >= -75 && random() < 0.55) {
            const shown = new Date(at.getTime() + 2_000);
            events.push({ ...base, eventType: "notification_displayed", occurredAt: shown });
            if (random() < 0.11) events.push({ ...base, eventType: "notification_clicked", occurredAt: new Date(shown.getTime() + 20_000 + random() * 300_000) });
          }
        }
      }
    }
  }

  for (let i = 0; i < events.length; i += 5000) {
    await prisma.advertisingEvent.createMany({ data: events.slice(i, i + 5000) });
  }
  await prisma.auditLog.create({
    data: { userId: adminId, action: "seed.sample_data", entityType: "system", summary: `Seeded sample data (${events.length} sample events tagged "${SAMPLE_TAG}")` },
  });
  console.log(`Seeded ${ads.length} advertisements, ${stations.length} stations, ${campaignDefs.length} campaigns, ${events.length} sample events.`);
}

async function main() {
  const admin = await seedUsers();
  await seedSettings();
  if (process.env.SEED_SAMPLE_DATA !== "false") await seedSampleData(admin.id);
  console.log(`Admin user: ${admin.email}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
