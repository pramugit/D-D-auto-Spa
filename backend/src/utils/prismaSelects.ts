// Shared field selections to make sure passwordHash never leaves the
// server in an API response, no matter how deeply a customer is nested.
export const safeCustomerSelect = {
  id: true,
  name: true,
  phone: true,
  email: true,
  address: true,
  loyaltyPoints: true,
  createdAt: true,
} as const;
