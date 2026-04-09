import { storage } from "./storage";

const DEFAULT_TAGS = [
  { name: "Lease Start Date", description: "The commencement date of the lease agreement", category: "Dates" },
  { name: "Lease End Date", description: "The expiration date of the lease agreement", category: "Dates" },
  { name: "Lease Term", description: "Duration of the lease (e.g., 5 years)", category: "Dates" },
  { name: "Monthly Rent", description: "Monthly rental amount", category: "Financial" },
  { name: "Annual Rent", description: "Annual rental amount", category: "Financial" },
  { name: "Rent Escalation", description: "Annual rent increase percentage or terms", category: "Financial" },
  { name: "Security Deposit", description: "Security deposit amount", category: "Financial" },
  { name: "Tenant Name", description: "Legal name of the tenant", category: "Parties" },
  { name: "Landlord Name", description: "Legal name of the landlord/lessor", category: "Parties" },
  { name: "Property Address", description: "Full address of the leased property", category: "Property" },
  { name: "Property Type", description: "Type of property (commercial, residential, industrial)", category: "Property" },
  { name: "Square Footage", description: "Total leased area in square feet", category: "Property" },
  { name: "Renewal Option", description: "Terms for lease renewal", category: "Terms" },
  { name: "Termination Clause", description: "Early termination conditions", category: "Terms" },
  { name: "Maintenance Responsibility", description: "Who is responsible for maintenance", category: "Terms" },
  { name: "Insurance Requirements", description: "Required insurance coverage", category: "Terms" },
  { name: "Permitted Use", description: "Allowed use of the premises", category: "Terms" },
  { name: "CAM Charges", description: "Common area maintenance charges", category: "Financial" },
  { name: "Tax Obligations", description: "Property tax responsibilities", category: "Financial" },
  { name: "Utility Responsibility", description: "Who pays for utilities", category: "Terms" },
  { name: "Subletting Rights", description: "Whether subletting is permitted", category: "Terms" },
  { name: "Notice Period", description: "Required notice period for termination", category: "Dates" },
  { name: "Guarantor", description: "Lease guarantor if any", category: "Parties" },
  { name: "Operating Hours", description: "Required or permitted operating hours", category: "Terms" },
  { name: "Parking Allocation", description: "Number of parking spaces allocated", category: "Property" },
  { name: "Signage Rights", description: "Rights for exterior/interior signage", category: "Terms" },
  { name: "Assignment Clause", description: "Terms for lease assignment", category: "Terms" },
  { name: "Default Provisions", description: "Events that constitute default", category: "Terms" },
  { name: "Lease Type", description: "Net, gross, modified gross, triple net", category: "Terms" },
  { name: "Broker Information", description: "Real estate broker details", category: "Parties" },
];

export async function seedDatabase() {
  try {
    const existingTags = await storage.getTags();
    if (existingTags.length === 0) {
      console.log("Seeding database with default tags...");
      for (const tag of DEFAULT_TAGS) {
        try {
          await storage.createTag(tag);
        } catch {
        }
      }
      console.log(`Seeded ${DEFAULT_TAGS.length} default tags`);
    }
  } catch (error) {
    console.error("Error seeding database:", error);
  }
}
