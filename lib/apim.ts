import { ClientSecretCredential } from "@azure/identity";
import { ApiManagementClient } from "@azure/arm-apimanagement";

export interface ApimSubscription {
  subscriptionId: string;
  primaryKey: string;
  secondaryKey: string;
  state: string;
}

function isConfigured(): boolean {
  return !!(
    process.env.AZURE_TENANT_ID &&
    process.env.AZURE_CLIENT_ID &&
    process.env.AZURE_CLIENT_SECRET &&
    process.env.AZURE_SUBSCRIPTION_ID &&
    process.env.AZURE_RESOURCE_GROUP &&
    process.env.APIM_SERVICE_NAME
  );
}

let _client: ApiManagementClient | null = null;

function getClient(): ApiManagementClient {
  if (!_client) {
    const credential = new ClientSecretCredential(
      process.env.AZURE_TENANT_ID!,
      process.env.AZURE_CLIENT_ID!,
      process.env.AZURE_CLIENT_SECRET!
    );
    _client = new ApiManagementClient(
      credential,
      process.env.AZURE_SUBSCRIPTION_ID!
    );
  }
  return _client;
}

async function getSubscription(
  client: ApiManagementClient,
  resourceGroup: string,
  serviceName: string,
  sid: string
): Promise<ApimSubscription | null> {
  try {
    const existing = await client.subscription.get(resourceGroup, serviceName, sid);
    const secrets = await client.subscription.listSecrets(resourceGroup, serviceName, sid);
    console.log("[APIM] Found existing subscription:", sid);
    return {
      subscriptionId: existing.name!,
      primaryKey: secrets.primaryKey!,
      secondaryKey: secrets.secondaryKey!,
      state: existing.state!,
    };
  } catch (err: unknown) {
    if (err instanceof Error && "statusCode" in err && (err as any).statusCode === 404) {
      return null;
    }
    throw err;
  }
}

export async function getOrCreateSubscription(
  keyId: string,
  displayName: string,
  existingSubscriptionId?: string
): Promise<ApimSubscription | null> {
  if (!isConfigured()) return null;

  const client = getClient();
  const resourceGroup = process.env.AZURE_RESOURCE_GROUP!;
  const serviceName = process.env.APIM_SERVICE_NAME!;
  const productId = process.env.APIM_PRODUCT_ID;

  // If user already has a subscription, verify it still exists in APIM
  if (existingSubscriptionId) {
    console.log("[APIM] Checking existing subscription:", existingSubscriptionId);
    const existing = await getSubscription(client, resourceGroup, serviceName, existingSubscriptionId);
    if (existing) return existing;
  }

  // Check if this keyId already has a subscription (retry scenario)
  console.log("[APIM] Checking subscription by keyId:", keyId);
  const byKeyId = await getSubscription(client, resourceGroup, serviceName, keyId);
  if (byKeyId) return byKeyId;

  // Create new subscription
  try {
    const scope = productId ? `/products/${productId}` : `/apis`;
    console.log("[APIM] Creating subscription with scope:", scope);
    const created = await client.subscription.createOrUpdate(
      resourceGroup,
      serviceName,
      keyId,
      {
        scope,
        displayName,
        state: "active",
      }
    );
    const secrets = await client.subscription.listSecrets(resourceGroup, serviceName, keyId);
    console.log("[APIM] Created subscription:", created.name);
    return {
      subscriptionId: created.name!,
      primaryKey: secrets.primaryKey!,
      secondaryKey: secrets.secondaryKey!,
      state: created.state!,
    };
  } catch (err: unknown) {
    console.error("[APIM] Create subscription error:", err);
    throw err;
  }
}
