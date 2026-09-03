import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaClient, type VehicleType } from "@prisma/client";

const prisma = new PrismaClient();

const STAFF_PASSWORD = "StaffPass123!";
const CUSTOMER_PASSWORD = "CustomerPass123!";

const VEHICLE_TYPES: VehicleType[] = ["SEDAN", "SUV", "HATCHBACK", "VAN", "PICKUP", "OTHER"];

/** Even pricing across every vehicle type, with a surcharge for larger vehicles. */
function pricingAll(base: number, bigSurcharge = 10) {
  const surcharge: Record<VehicleType, number> = {
    SEDAN: 0,
    HATCHBACK: 0,
    OTHER: 0,
    SUV: bigSurcharge,
    VAN: bigSurcharge + 5,
    PICKUP: bigSurcharge + 5,
  };
  return VEHICLE_TYPES.map((vehicleType) => ({ vehicleType, price: base + surcharge[vehicleType] }));
}

async function seedStaff() {
  const staff = [
    { name: "Admin User", email: "admin@autobody.test", phone: "0710000001", role: "ADMIN" as const },
    { name: "Priya Mendis", email: "manager@autobody.test", phone: "0710000002", role: "MANAGER" as const },
    { name: "Kasun Perera", email: "reception@autobody.test", phone: "0710000003", role: "RECEPTIONIST" as const },
    { name: "Alex Fernando", email: "tech1@autobody.test", phone: "0710000004", role: "TECHNICIAN" as const },
    { name: "Dinesh Kumar", email: "tech2@autobody.test", phone: "0710000005", role: "TECHNICIAN" as const },
    { name: "Sanduni Wickramasinghe", email: "tech3@autobody.test", phone: "0710000006", role: "TECHNICIAN" as const },
  ];

  const passwordHash = await bcrypt.hash(STAFF_PASSWORD, 10);

  for (const s of staff) {
    await prisma.user.upsert({
      where: { email: s.email },
      update: {},
      create: { ...s, passwordHash },
    });
  }
  console.log(`Seeded ${staff.length} staff accounts (password: ${STAFF_PASSWORD})`);
}

async function seedCatalog() {
  const exterior = await prisma.serviceCategory.upsert({
    where: { name: "EXTERIOR" },
    update: {},
    create: { name: "EXTERIOR" },
  });
  const interior = await prisma.serviceCategory.upsert({
    where: { name: "INTERIOR" },
    update: {},
    create: { name: "INTERIOR" },
  });

  const services = [
    {
      categoryId: exterior.id,
      name: "Exterior Wash",
      description: "Hand wash, wheel clean, and dry.",
      durationMinutes: 30,
      pricing: pricingAll(20),
    },
    {
      categoryId: exterior.id,
      name: "Exterior Wax",
      description: "Hand wax and shine for a protected, glossy finish.",
      durationMinutes: 45,
      pricing: pricingAll(35),
    },
    {
      categoryId: exterior.id,
      name: "Paint Correction",
      description: "Machine polish to remove swirl marks and light scratches.",
      durationMinutes: 120,
      pricing: pricingAll(120, 20),
    },
    {
      categoryId: exterior.id,
      name: "Ceramic Coating",
      description: "Long-lasting ceramic protective layer.",
      durationMinutes: 180,
      pricing: pricingAll(250, 40),
    },
    {
      categoryId: exterior.id,
      name: "Dent & Scratch Removal",
      description: "Paintless dent removal and minor scratch touch-up.",
      durationMinutes: 90,
      pricing: pricingAll(80, 15),
    },
    {
      categoryId: interior.id,
      name: "Interior Vacuum & Wipe Down",
      description: "Full vacuum, dashboard and door panel wipe down.",
      durationMinutes: 30,
      pricing: pricingAll(25),
    },
    {
      categoryId: interior.id,
      name: "Seat & Carpet Shampoo",
      description: "Deep clean upholstery and carpets.",
      durationMinutes: 90,
      pricing: pricingAll(90, 15),
    },
    {
      categoryId: interior.id,
      name: "Leather Conditioning",
      description: "Clean and condition leather seats and trim.",
      durationMinutes: 45,
      pricing: pricingAll(50, 10),
    },
  ];

  const createdServices: Record<string, string> = {};
  let newCount = 0;
  for (const svc of services) {
    const existing = await prisma.service.findFirst({ where: { name: svc.name } });
    if (existing) {
      createdServices[svc.name] = existing.id;
      continue;
    }
    const created = await prisma.service.create({
      data: {
        categoryId: svc.categoryId,
        name: svc.name,
        description: svc.description,
        durationMinutes: svc.durationMinutes,
        pricing: { create: svc.pricing },
      },
    });
    createdServices[svc.name] = created.id;
    newCount += 1;
  }
  console.log(`Seeded ${services.length} services (${newCount} new, ${services.length - newCount} already existed)`);

  const packageName = "Complete Detail Package";
  const existingPackage = await prisma.servicePackage.findFirst({ where: { name: packageName } });
  if (!existingPackage) {
    await prisma.servicePackage.create({
      data: {
        name: packageName,
        description: "Exterior wax, interior vacuum, and seat shampoo bundled at a discount.",
        discountedPrice: 130,
        services: {
          create: [
            { serviceId: createdServices["Exterior Wax"] },
            { serviceId: createdServices["Interior Vacuum & Wipe Down"] },
            { serviceId: createdServices["Seat & Carpet Shampoo"] },
          ],
        },
      },
    });
    console.log(`Seeded package "${packageName}"`);
  }
}

async function seedBays() {
  const bays = ["Bay 1", "Bay 2"];
  for (const name of bays) {
    await prisma.bay.upsert({ where: { name }, update: {}, create: { name } });
  }
  console.log(`Seeded ${bays.length} bays`);
}

/** Default landing-page gallery, replaceable later from the Admin Portal. */
async function seedSiteImages() {
  const slots = 7;
  for (let slot = 1; slot <= slots; slot++) {
    await prisma.siteImage.upsert({
      where: { slot },
      update: {},
      create: { slot, url: `/gallery-${slot}.jpg` },
    });
  }
  console.log(`Seeded ${slots} site gallery images`);
}

/** Default landing-page text/image content, editable later from the Admin Portal. */
async function seedSiteContent() {
  const landingContent = {
    contact: {
      location: "Colombo, Sri Lanka",
      email: "hello@autobody.test",
      hours: "Mon - Sat: 8:00 AM - 6:00 PM",
    },
    hero: {
      slides: [
        {
          eyebrow: "Keep your car shining",
          headlineA: "We Provide Car",
          headlineB: "Detailing",
          headlineC: "Services",
          body: "From a full wash and polish to paint correction, our certified specialists treat every panel with care so your car looks showroom-ready every visit.",
        },
        {
          eyebrow: "Protect your paintwork",
          headlineA: "We Provide Ceramic",
          headlineB: "Coating",
          headlineC: "Services",
          body: "A durable ceramic layer that guards your paint against UV, dust and minor scratches, while keeping that just-detailed shine for months.",
        },
      ],
    },
    features: [
      { title: "Quality Service", body: "Every wash, polish and coating job is inspected before handover.", dark: false },
      { title: "Online Booking", body: "Pick a service, a bay slot, and book in a couple of minutes.", dark: true },
      { title: "Certified Technicians", body: "Trained staff using proper equipment and detailing products.", dark: false },
      { title: "Fair Pricing", body: "Transparent pricing per vehicle type, shown before you book.", dark: true },
    ],
    about: {
      image: "https://plus.unsplash.com/premium_photo-1661443450192-f589ab785b62?fm=jpg&q=60&w=800&auto=format&fit=crop",
      paragraph:
        "AutoBody is a dedicated exterior & interior detailing station — wash, wax, polish, paint correction, ceramic coating and dent/scratch removal. No mechanical repairs, just a car that looks its absolute best.",
      bullets: [
        "We care about your car as much as you do.",
        "Certified & trained staff using proper equipment.",
        "Transparent pricing, booked online in minutes.",
      ],
    },
    services: [
      {
        title: "Auto Detailing",
        body: "A deep clean of your car's interior and exterior for a showroom-like finish.",
        image: "https://plus.unsplash.com/premium_photo-1682096769615-9c1729638821?fm=jpg&q=60&w=600&auto=format&fit=crop",
      },
      {
        title: "Express Exterior",
        body: "A quick, effective wash to remove dirt and grime and bring back the shine.",
        image: "https://images.unsplash.com/photo-1678383408281-b350a3a9b7e1?fm=jpg&q=60&w=600&auto=format&fit=crop",
      },
      {
        title: "Full Tire Wash",
        body: "We clean, shine and protect your tires and rims to keep them looking their best.",
        image: "https://images.unsplash.com/photo-1763596554080-0ead6713db60?fm=jpg&q=60&w=600&auto=format&fit=crop",
      },
      {
        title: "Protective Coating",
        body: "Premium ceramic coating to protect your paint from UV, dust and minor scratches.",
        image: "https://plus.unsplash.com/premium_photo-1663045588286-b9257e377a2e?fm=jpg&q=60&w=600&auto=format&fit=crop",
      },
    ],
  };

  await prisma.siteContent.upsert({
    where: { key: "landing" },
    update: {},
    create: { key: "landing", data: landingContent },
  });
  console.log("Seeded landing page content");
}

async function seedCustomers() {
  const passwordHash = await bcrypt.hash(CUSTOMER_PASSWORD, 10);

  const customers: {
    name: string;
    email: string;
    phone: string;
    address: string;
    vehicles: { make: string; model: string; year: number; plateNumber: string; color: string; vehicleType: VehicleType }[];
  }[] = [
    {
      name: "Nadeesha Perera",
      email: "nadeesha@example.com",
      phone: "0771234567",
      address: "12 Galle Road, Colombo",
      vehicles: [
        { make: "Toyota", model: "Corolla", year: 2021, plateNumber: "CAB-1234", color: "White", vehicleType: "SEDAN" },
      ],
    },
    {
      name: "Chathura Jayasuriya",
      email: "chathura@example.com",
      phone: "0772345678",
      address: "45 Kandy Road, Kadawatha",
      vehicles: [
        { make: "Honda", model: "CR-V", year: 2020, plateNumber: "CAD-5678", color: "Black", vehicleType: "SUV" },
      ],
    },
    {
      name: "Sanduni Wickramasinghe",
      email: "sanduni.w@example.com",
      phone: "0773456789",
      address: "8 Negombo Road, Wattala",
      vehicles: [
        { make: "Suzuki", model: "Alto", year: 2019, plateNumber: "CAE-9012", color: "Silver", vehicleType: "HATCHBACK" },
        { make: "Toyota", model: "Hilux", year: 2022, plateNumber: "CAF-3456", color: "Grey", vehicleType: "PICKUP" },
      ],
    },
  ];

  for (const c of customers) {
    const customer = await prisma.customer.upsert({
      where: { email: c.email },
      update: {},
      create: {
        name: c.name,
        email: c.email,
        phone: c.phone,
        address: c.address,
        passwordHash,
      },
    });

    for (const v of c.vehicles) {
      await prisma.vehicle.upsert({
        where: { plateNumber: v.plateNumber },
        update: {},
        create: { ...v, customerId: customer.id },
      });
    }
  }
  console.log(`Seeded ${customers.length} customers (password: ${CUSTOMER_PASSWORD})`);
}

async function main() {
  await seedStaff();
  await seedCatalog();
  await seedBays();
  await seedCustomers();
  await seedSiteImages();
  await seedSiteContent();
  console.log("\nSeed complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
