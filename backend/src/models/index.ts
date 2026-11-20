import mongoose, {Schema} from "mongoose";

const MerchantSchema = new Schema({
  name: {type:String, required:true, trim:true}, tradeLicense:{type:String, required:true}, emirate:{type:String, required:true},
  category:{type:String, required:true}, settlementPreference:{type:String, enum:["stablecoin","partner-fiat"], default:"stablecoin"},
  walletAddress:{type:String, required:true}, email:{type:String, required:true, unique:true, lowercase:true}, passwordHash:{type:String, required:true},
  status:{type:String, enum:["pending_kyc","testnet_active","suspended"], default:"testnet_active"}
}, {timestamps:true});

const PaymentSchema = new Schema({
  paymentId:{type:String, required:true}, chain:{type:String, required:true}, merchantId:{type:Schema.Types.ObjectId, ref:"Merchant", required:true},
  amount:{type:String, required:true}, description:{type:String, default:""}, tokenAddress:{type:String, required:true},
  status:{type:String, enum:["pending","paid","refunded","expired"], default:"pending"}, txHash:{type:String}, customerAddress:{type:String},
  expiresAt:{type:Date, required:true}, settledAt:{type:Date}
}, {timestamps:true});
PaymentSchema.index({paymentId:1,chain:1},{unique:true});

const SubscriptionSchema = new Schema({
  subscriptionId:{type:String,required:true}, chain:{type:String,required:true}, merchantId:{type:Schema.Types.ObjectId,ref:"Merchant",required:true},
  customerAddress:{type:String,required:true}, amountPerPeriod:{type:String,required:true}, periodSeconds:{type:Number,required:true},
  nextChargeAt:{type:Date,required:true}, status:{type:String,default:"active"}
},{timestamps:true});
SubscriptionSchema.index({subscriptionId:1,chain:1},{unique:true});

export const Merchant = mongoose.models.Merchant || mongoose.model("Merchant",MerchantSchema);
export const Payment = mongoose.models.Payment || mongoose.model("Payment",PaymentSchema);
export const Subscription = mongoose.models.Subscription || mongoose.model("Subscription",SubscriptionSchema);

const WebhookEventSchema = new Schema({eventId:{type:String,required:true,unique:true},payloadHash:{type:String,required:true}}, {timestamps:true});
export const WebhookEvent = mongoose.models.WebhookEvent || mongoose.model("WebhookEvent",WebhookEventSchema);
