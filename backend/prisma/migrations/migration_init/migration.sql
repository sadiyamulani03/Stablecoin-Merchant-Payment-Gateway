CREATE DATABASE IF NOT EXISTS stablecoin_gateway CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE stablecoin_gateway;

CREATE TABLE IF NOT EXISTS Merchant (
  id CHAR(36) NOT NULL,
  name VARCHAR(191) NOT NULL,
  tradeLicense VARCHAR(191) NOT NULL,
  emirate VARCHAR(191) NOT NULL,
  category VARCHAR(191) NOT NULL,
  settlementPreference VARCHAR(191) NOT NULL DEFAULT 'stablecoin',
  walletAddress VARCHAR(191) NOT NULL,
  email VARCHAR(191) NOT NULL,
  passwordHash VARCHAR(191) NOT NULL,
  status VARCHAR(191) NOT NULL DEFAULT 'testnet_active',
  createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updatedAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE UNIQUE INDEX Merchant_email_key ON Merchant(email);

CREATE TABLE IF NOT EXISTS Payment (
  id CHAR(36) NOT NULL,
  paymentId VARCHAR(191) NOT NULL,
  chain VARCHAR(191) NOT NULL,
  merchantId CHAR(36) NOT NULL,
  amount VARCHAR(191) NOT NULL,
  description VARCHAR(191) NOT NULL DEFAULT '',
  tokenAddress VARCHAR(191) NOT NULL,
  status VARCHAR(191) NOT NULL DEFAULT 'pending',
  txHash VARCHAR(191),
  customerAddress VARCHAR(191),
  expiresAt DATETIME(3) NOT NULL,
  settledAt DATETIME(3),
  createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updatedAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE INDEX Payment_paymentId_chain_key (paymentId, chain),
  INDEX Payment_merchantId_idx (merchantId),
  INDEX Payment_paymentId_idx (paymentId),
  INDEX Payment_chain_idx (chain),
  INDEX Payment_status_idx (status),
  INDEX Payment_merchantId_status_idx (merchantId, status),
  FOREIGN KEY (merchantId) REFERENCES Merchant(id) ON DELETE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS Subscription (
  id CHAR(36) NOT NULL,
  subscriptionId VARCHAR(191) NOT NULL,
  chain VARCHAR(191) NOT NULL,
  merchantId CHAR(36) NOT NULL,
  customerAddress VARCHAR(191) NOT NULL,
  amountPerPeriod VARCHAR(191) NOT NULL,
  periodSeconds INT NOT NULL,
  nextChargeAt DATETIME(3) NOT NULL,
  status VARCHAR(191) NOT NULL DEFAULT 'active',
  createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updatedAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE INDEX Subscription_subscriptionId_chain_key (subscriptionId, chain),
  INDEX Subscription_merchantId_idx (merchantId),
  INDEX Subscription_subscriptionId_idx (subscriptionId),
  INDEX Subscription_chain_idx (chain),
  FOREIGN KEY (merchantId) REFERENCES Merchant(id) ON DELETE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS WebhookEvent (
  id CHAR(36) NOT NULL,
  eventId VARCHAR(191) NOT NULL,
  payloadHash VARCHAR(191) NOT NULL,
  createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updatedAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE INDEX WebhookEvent_eventId_key (eventId)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
