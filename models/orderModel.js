// models/Order.js - FULL UPDATED CODE
import mongoose from 'mongoose';

const orderSchema = new mongoose.Schema(
  {
    // ✅ S.No Field
    sNo: {
      type: Number,
      unique: true,
      index: true
    },

    // 🧑 Registered User (optional)
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: false,
    },

    // 👤 Guest user reference (optional)
    guestUser: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'GuestUser',
      required: false,
    },

    // 🚀 Unique order identifier (AUTO-GENERATED - not required)
    orderId: {
      type: String,
      unique: true,
      required: false, // ✅ Change this to false - it's auto-generated
    },

    // 💳 Payment fields
    razorpayOrderId: { type: String },
    paymentId: { type: String },
    paymentSignature: { type: String },

    // 🛒 Ordered products
    products: [
      {
        product: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'Product',
          required: true,
        },
        quantity: {
          type: Number,
          required: true,
          min: 1,
        },
        price: {
          type: Number,
          required: true,
        },
        name: { type: String }, // Added for better order display
        selectedSize: { type: String }, // ✅ ADDED: Store selected size
      },
    ],

    // 📦 Shipping details
    shippingAddress: {
      firstName: { type: String }, // Added for frontend compatibility
      lastName: { type: String },  // Added for frontend compatibility
      fullName: { type: String },
      address: { type: String, required: true },
      city: { type: String, required: true },
      state: { type: String, required: true },
      pincode: { type: String }, // Added for frontend compatibility
      postalCode: { type: String, required: true },
      country: { type: String, required: true },
      phone: { type: String, required: true },
    },

    // 💰 Payment info
    paymentMethod: {
      type: String,
      enum: ['razorpay', 'stripe', 'cod'],
      required: true,
      default: 'cod',
    },
    paymentStatus: {
      type: String,
      enum: ['pending', 'completed', 'failed', 'refunded', 'partially_refunded'],
      default: 'pending',
    },

    // 📊 Amount breakdown
    totalAmount: { type: Number, required: true },
    shippingFee: { type: Number, default: 0 },
    taxAmount: { type: Number, default: 0 },
    finalAmount: { type: Number, required: true },

    // 🧾 Order status
    orderStatus: {
      type: String,
      enum: [
        'pending',
        'confirmed',
        'processing',
        'shipped',
        'delivered',
        'cancelled',
        'refunded',
        'partially_refunded'
      ],
      default: 'pending',
    },

    // 🚫 Cancellation fields
    cancelledAt: { type: Date },
    cancelledBy: { 
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    cancellationReason: { type: String },

    // 💰 Refund history
    refunds: [{
      refundId: { type: String, required: true },
      amount: { type: Number, required: true },
      razorpayPaymentId: { type: String, required: true },
      type: { 
        type: String, 
        enum: ['full', 'partial'],
        required: true 
      },
      createdAt: { type: Date, default: Date.now },
      notes: { type: Object }
    }],

    // ⏰ Timestamps
    paidAt: { type: Date },
    deliveredAt: { type: Date },

    // 👥 Guest order flag
    isGuestOrder: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

// 🆔 Auto-generate clean unique orderId (ORD-YYYYMMDD-XXXXXX)
orderSchema.pre('save', async function (next) {
  if (this.isNew && !this.orderId) {
    try {
      let unique = false;
      let attempts = 0;
      const maxAttempts = 10;
      
      while (!unique && attempts < maxAttempts) {
        const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        const randomPart = Math.random().toString(36).substring(2, 8).toUpperCase();
        const id = `ORD-${datePart}-${randomPart}`;
        
        const exists = await mongoose.model('Order').findOne({ orderId: id });
        if (!exists) {
          this.orderId = id;
          unique = true;
          console.log(`✅ Generated orderId: ${id} for ${this.isGuestOrder ? 'guest' : 'user'} order`);
        }
        attempts++;
      }
      
      if (!unique) {
        this.orderId = `ORD-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
        console.log(`✅ Generated fallback orderId: ${this.orderId}`);
      }
    } catch (err) {
      console.error('Order ID generation failed:', err);
      this.orderId = `ORD-${Date.now()}`;
    }
  }
  next();
});

// 🔢 Auto-increment S.No before saving new orders
orderSchema.pre('save', async function (next) {
  if (this.isNew) {
    try {
      const lastOrder = await this.constructor.findOne({}, {}, { sort: { 'sNo': -1 } });
      this.sNo = lastOrder ? lastOrder.sNo + 1 : 1;
      console.log(`✅ Generated S.No: ${this.sNo} for order ${this.orderId}`);
    } catch (error) {
      console.error('S.No generation failed:', error);
      // Fallback if auto-increment fails
      this.sNo = Date.now();
    }
  }
  next();
});

const Order = mongoose.model('Order', orderSchema);
export default Order;