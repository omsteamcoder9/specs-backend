import Razorpay from 'razorpay';
import crypto from 'crypto';
import dotenv from 'dotenv';
import Order from '../models/orderModel.js';
import Product from '../models/productModel.js';
import User from '../models/userModel.js';
import bcrypt from 'bcryptjs';
import { emailTemplates, sendEmail, sendOrderConfirmation, sendOrderStatusUpdate, sendGuestPasswordEmail } from './emailController.js';
import Shipping from '../models/shippingModel.js';
import shippingService from '../services/shippingService.js';

dotenv.config();

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

/* -------------------------------------------------------------------------- */
/* 🧩 1. Create Razorpay order (for both guest & registered users)             */
/* -------------------------------------------------------------------------- */
export const createRazorpayOrder = async (req, res) => {
  try {
    const { orderId } = req.body;

    if (!orderId) {
      return res.status(400).json({ success: false, message: 'Order ID is required' });
    }

    // Find order (check both guest & registered)
    const order = await Order.findOne({ orderId });
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    if (order.paymentStatus === 'completed') {
      return res.status(400).json({ success: false, message: 'Order already paid' });
    }

    // Create Razorpay order
    const razorpayOrder = await razorpay.orders.create({
      amount: Math.round(order.finalAmount * 100), // ₹ to paise
      currency: 'INR',
      receipt: order.orderId,
      notes: {
        orderId: order.orderId,
        type: order.isGuestOrder ? 'guest' : 'user',
        ...(order.isGuestOrder
          ? { guestEmail: order.guestUser?.email }
          : { userId: order.user?.toString() }),
      },
    });

    // Save Razorpay details
    order.razorpayOrderId = razorpayOrder.id;
    order.paymentMethod = 'razorpay';
    await order.save();

    res.json({
      success: true,
      order: razorpayOrder,
      key: process.env.RAZORPAY_KEY_ID,
    });
  } catch (error) {
    console.error('Create Razorpay order error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/* -------------------------------------------------------------------------- */
/* 🧩 2. Verify Razorpay payment + update stock (for both guest & users)      */
/* -------------------------------------------------------------------------- */
export const verifyPayment = async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({
        success: false,
        message: 'Missing payment verification data',
      });
    }

    // Generate and compare signature
    const generatedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest('hex');

    if (generatedSignature !== razorpay_signature) {
      return res.status(400).json({
        success: false,
        message: 'Payment verification failed',
      });
    }

    // Find order by Razorpay order ID
    const order = await Order.findOne({ razorpayOrderId: razorpay_order_id })
      .populate('user', 'name email')
      .populate('guestUser', 'name email phone')
      .populate('products.product', 'name price stock');
    
    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found for this payment',
      });
    }

    // Update stock only if not already deducted and payment is not completed
    if (order.paymentStatus !== 'completed') {
      for (const item of order.products) {
        if (item.product && item.product.stock >= item.quantity) {
          await Product.findByIdAndUpdate(item.product._id, {
            $inc: { stock: -item.quantity },
          });
          console.log(`Updated stock for ${item.product.name}: -${item.quantity}`);
        }
      }
    }

    // Update payment details
    order.paymentId = razorpay_payment_id;
    order.paymentStatus = 'completed';
    order.orderStatus = 'confirmed';
    order.paidAt = new Date();
    await order.save();

    // ✅ NEW: Handle guest user password creation and email
    if (order.isGuestOrder) {
      try {
        console.log('🎯 Processing guest user account creation');
        
        // Get guest email from various possible locations
        let guestEmail = '';
        
        // Try to get email from populated guestUser
        if (order.guestUser && order.guestUser.email) {
          guestEmail = order.guestUser.email;
          console.log('📧 Using email from guestUser:', guestEmail);
        }
        // Try to get email from shipping address (if you store it there)
        else if (order.shippingAddress && order.shippingAddress.email) {
          guestEmail = order.shippingAddress.email;
          console.log('📧 Using email from shipping address:', guestEmail);
        }
        // For createGuestOrder flow, check user reference
        else if (order.user) {
          // If order.user is populated, get email from there
          const userDoc = await User.findById(order.user);
          if (userDoc && userDoc.email) {
            guestEmail = userDoc.email;
            console.log('📧 Using email from user document:', guestEmail);
          }
        }
        
        if (guestEmail && guestEmail.includes('@')) {
          console.log(`📧 Found guest email: ${guestEmail}`);
          
          // Generate password
          const generatedPassword = generateGuestPassword(guestEmail);
          console.log(`🔑 Generated password: ${generatedPassword}`);
          
          // Hash the password before saving
          const salt = await bcrypt.genSalt(10);
          const hashedPassword = await bcrypt.hash(generatedPassword, salt);
          
          // Check if user already exists with this email
          let existingUser = await User.findOne({ email: guestEmail.toLowerCase() });
          
          if (existingUser) {
            console.log(`ℹ️ User already exists with email: ${guestEmail}`);
            
            // Update existing user - remove guest flag and set password
            existingUser.isGuest = false;
            existingUser.password = hashedPassword;
            existingUser.role = 'user';
            await existingUser.save();
            
            console.log(`✅ Updated existing user with new password`);
          } else {
            // Create new user account for guest
            const newUser = await User.create({
              name: order.guestUser?.name || 
                    order.shippingAddress?.fullName || 
                    order.shippingAddress?.name || 
                    'Guest Customer',
              email: guestEmail.toLowerCase(),
              phone: order.guestUser?.phone || order.shippingAddress?.phone || '',
              password: hashedPassword,
              isGuest: false,
              role: 'user',
              accountCreatedFromOrder: order.orderId
            });
            
            console.log(`✅ Created new user account for guest: ${newUser._id}`);
          }
          
          // Send password email to guest
          try {
            console.log(`📧 Attempting to send password email to guest: ${guestEmail}`);
            
            // ✅ FIXED: Use the already imported function, NOT dynamic import
            const emailResult = await sendGuestPasswordEmail(guestEmail, generatedPassword, order);
            
            if (emailResult.success) {
              console.log(`✅ Guest password email sent successfully to: ${guestEmail}`);
            } else {
              console.error(`❌ Guest password email failed:`, emailResult.error);
            }
          } catch (emailError) {
            console.error('❌ Guest password email failed with error:', emailError.message);
            console.error('Error stack:', emailError.stack);
            // Continue even if email fails
          }
        } else {
          console.warn('⚠️ No valid guest email found, skipping account creation');
        }
      } catch (guestError) {
        console.error('❌ Guest account creation failed:', guestError.message);
        console.error('Error stack:', guestError.stack);
        // Don't fail the payment verification if guest processing fails
      }
    }

    // 🚀 AUTO-CREATE SHIPMENT ON SHIPROCKET AFTER PAYMENT VERIFICATION
    let shipmentResult = null;
    try {
      console.log('🚀 Attempting to auto-create shipment for order:', order.orderId);
      
      // Import shipping service
      const shippingService = await import('../services/shippingService.js');
      
      // Create shipment using your existing shipping service
      const shipment = await shippingService.default.createShipment(order, {});
      
      if (shipment && shipment.shipment_id) {
        console.log('📦 ShipRocket shipment created successfully:', shipment.shipment_id);
        
        // Create shipping document in database
        const Shipping = await import('../models/shippingModel.js');
        
        const shippingData = {
          orderId: order.orderId,
          order: order._id,
          shipmentId: shipment.shipment_id.toString(),
          userType: order.isGuestOrder ? 'guest' : 'user',
          userId: order.isGuestOrder ? order.guestUser?._id : order.user?._id,
          pickupLocation: {},
          shippingStatus: 'pending',
          awbNumber: shipment.awb_code || null,
          courierName: shipment.courier_name || null,
          courierCompanyId: shipment.courier_company_id || null,
          shippingCharges: order.shippingAmount || 0,
          shipRocketResponse: shipment,
          labelUrl: shipment.label_url || null,
          manifestUrl: shipment.manifest_url || null
        };

        // Only add user field for registered users
        if (!order.isGuestOrder && order.user?._id) {
          shippingData.user = order.user._id;
        }

        const shippingDoc = await Shipping.default.create(shippingData);

        // Update order with shipment details
        order.shipmentId = shipment.shipment_id.toString();
        order.shippingStatus = shipment.status || 'pending';
        order.awbNumber = shipment.awb_code || null;
        order.courierName = shipment.courier_name || null;
        await order.save();

        shipmentResult = {
          shipmentId: shipment.shipment_id,
          awbNumber: shipment.awb_code,
          courierName: shipment.courier_name,
          status: shipment.status,
          labelUrl: shipment.label_url,
          manifestUrl: shipment.manifest_url
        };
        
        console.log('✅ Shipment created and order updated successfully');
      }
    } catch (shipmentError) {
      console.error('❌ Auto-shipment creation failed:', shipmentError.message);
      // Don't fail the payment verification if shipment creation fails
      // Just log the error and continue
      shipmentResult = {
        error: shipmentError.message,
        note: 'Shipment will need to be created manually'
      };
    }

    // Send regular order confirmation email (for both guest and registered users)
    try {
      const emailResult = await sendOrderConfirmation(order._id);
      
      if (!emailResult.userEmail || emailResult.userEmail.success === false) {
        console.warn('⚠️ Order confirmation email failed, but order was created successfully');
        console.log('Order details:', {
          orderId: order.orderId,
          amount: order.finalAmount,
          paymentStatus: order.paymentStatus
        });
      } else {
        console.log('✅ Order confirmation email sent successfully');
      }
    } catch (emailError) {
      console.error('❌ Email sending failed, but order was created:', emailError.message);
      // Don't throw - allow the payment to be successful even if email fails
    }

    // Populate order for response
    let populatedOrder;
    if (order.isGuestOrder) {
      populatedOrder = await Order.findById(order._id)
        .populate('guestUser', 'name email phone')
        .populate('products.product', 'name image price');
    } else {
      populatedOrder = await Order.findById(order._id)
        .populate('user', 'name email')
        .populate('products.product', 'name image price');
    }

    // Prepare response
    const response = {
      success: true,
      order: populatedOrder,
      message: 'Payment verified and order confirmed successfully',
    };

    // Add shipment info to response if available
    if (shipmentResult) {
      if (shipmentResult.error) {
        response.shipment = {
          success: false,
          message: 'Auto-shipment creation failed',
          error: shipmentResult.error,
          note: shipmentResult.note
        };
      } else {
        response.shipment = {
          success: true,
          message: 'Shipment created automatically',
          data: shipmentResult
        };
      }
    }

    res.json(response);
  } catch (error) {
    console.error('Verify payment error:', error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

/* -------------------------------------------------------------------------- */
/* 🧩 3. Payment failed (for both guest & users)                              */
/* -------------------------------------------------------------------------- */
export const paymentFailed = async (req, res) => {
  try {
    const { razorpay_order_id } = req.body;
    const order = await Order.findOne({ razorpayOrderId: razorpay_order_id });

    if (order) {
      order.paymentStatus = 'failed';
      order.orderStatus = 'cancelled';
      await order.save();
    }

    res.json({
      success: false,
      message: 'Payment failed. Please try again.',
    });
  } catch (error) {
    console.error('Payment failed error:', error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

/* -------------------------------------------------------------------------- */
/* 🧩 4. Get payment details                                                  */
/* -------------------------------------------------------------------------- */
export const getPaymentDetails = async (req, res) => {
  try {
    const payment = await razorpay.payments.fetch(req.params.paymentId);
    res.json({ success: true, payment });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/* -------------------------------------------------------------------------- */
/* 🧩 5. Refund payment (with comprehensive validation)                       */
/* -------------------------------------------------------------------------- */
export const refundPayment = async (req, res) => {
  try {
    const { notes, refund_amount } = req.body;
    const { paymentId } = req.params;
    
    console.log(`Processing refund for payment: ${paymentId}`);
    
    // First, verify the payment exists in Razorpay
    let razorpayPayment;
    try {
      razorpayPayment = await razorpay.payments.fetch(paymentId);
      console.log('Razorpay payment details:', {
        id: razorpayPayment.id,
        amount: razorpayPayment.amount,
        currency: razorpayPayment.currency,
        status: razorpayPayment.status,        
        amount_refunded: razorpayPayment.amount_refunded,
        refund_status: razorpayPayment.refund_status
      });
    } catch (error) {
      return res.status(404).json({
        success: false,
        message: 'Payment not found in Razorpay',
        error: error.message
      });
    }

    // Check if payment is already fully refunded
    if (razorpayPayment.amount_refunded === razorpayPayment.amount) {
      return res.status(400).json({
        success: false,
        message: 'Payment has already been fully refunded',
        payment: {
          id: razorpayPayment.id,
          amount: razorpayPayment.amount,
          amount_refunded: razorpayPayment.amount_refunded,
          status: razorpayPayment.status
        }
      });
    }

    // Check if payment is captured/authorized
    if (razorpayPayment.status !== 'captured' && razorpayPayment.status !== 'authorized') {
      return res.status(400).json({
        success: false,
        message: `Cannot refund payment with status: ${razorpayPayment.status}`,
        validStatuses: ['captured', 'authorized']
      });
    }

    // Find order in our database
    const order = await Order.findOne({ 
      $or: [
        { paymentId: paymentId },
        { razorpayOrderId: razorpayPayment.order_id }
      ]
    }).populate('products.product', 'name price');

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found for this payment ID',
      });
    }

    // Calculate refund amount
    let refundAmount;
    if (refund_amount) {
      // Use provided refund amount
      refundAmount = Math.round(refund_amount * 100); // Convert to paise
    } else {
      // Use remaining amount (full refund)
      refundAmount = razorpayPayment.amount - razorpayPayment.amount_refunded;
    }

    // Validate refund amount
    if (refundAmount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid refund amount',
        available_for_refund: razorpayPayment.amount - razorpayPayment.amount_refunded
      });
    }

    if (refundAmount > (razorpayPayment.amount - razorpayPayment.amount_refunded)) {
      return res.status(400).json({
        success: false,
        message: 'Refund amount exceeds available amount',
        requested_refund: refundAmount,
        available_for_refund: razorpayPayment.amount - razorpayPayment.amount_refunded
      });
    }

    console.log('Processing refund:', {
      payment_id: paymentId,
      refund_amount: refundAmount,
      currency: razorpayPayment.currency
    });

    // Create refund
    const refund = await razorpay.payments.refund(paymentId, {
      amount: refundAmount,
      notes: notes || { reason: 'Customer request' },
    });
    
    console.log('Refund created successfully:', refund);

    // Update order status based on refund type
    if (refundAmount === razorpayPayment.amount) {
      // Full refund
      order.paymentStatus = 'refunded';
      order.orderStatus = 'refunded';
    } else {
      // Partial refund
      order.paymentStatus = 'partially_refunded';
      order.orderStatus = 'partially_refunded';
    }
    
    // Add refund details to order
    order.refunds = order.refunds || [];
    order.refunds.push({
      refundId: refund.id,
      amount: refundAmount / 100, // Convert back from paise
      razorpayPaymentId: paymentId,
      type: refundAmount === razorpayPayment.amount ? 'full' : 'partial',
      createdAt: new Date(),
      notes: notes || { reason: 'Customer request' }
    });

    // Restore product stock for full refunds
    if (refundAmount === razorpayPayment.amount) {
      for (const item of order.products) {
        await Product.findByIdAndUpdate(item.product._id, {
          $inc: { stock: item.quantity }
        });
        console.log(`Restored ${item.quantity} units for product: ${item.product.name}`);
      }
    }
    
    await order.save();

    res.json({
      success: true,
      refund: {
        id: refund.id,
        amount: refundAmount / 100,
        currency: razorpayPayment.currency,
        status: refund.status,
        type: refundAmount === razorpayPayment.amount ? 'full' : 'partial'
      },
      message: `Payment refunded successfully (${refundAmount === razorpayPayment.amount ? 'full' : 'partial'} refund)`,
      userType: order.user ? 'registered' : 'guest',
      orderStatus: order.orderStatus
    });
  } catch (error) {
    console.error('Refund error:', error);
    
    // Handle specific Razorpay error cases
    if (error.statusCode === 400) {
      return res.status(400).json({
        success: false,
        message: 'Refund failed',
        error: error.error?.description || error.message,
        code: error.error?.code
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Internal server error during refund',
      error: error.message
    });
  }
};

/* -------------------------------------------------------------------------- */
/* 🧩 6. Create guest order (NEW)                                             */
/* -------------------------------------------------------------------------- */
export const createGuestOrder = async (req, res) => {
  try {
    const {
      products,
      shippingAddress,
      guestUser,
      paymentMethod = 'razorpay'
    } = req.body;

    console.log('Received guest order request');
    console.log(guestUser);

    if (!products || !shippingAddress || !guestUser) {
      return res.status(400).json({
        success: false,
        message: 'Products, shipping address, and guest user details are required'
      });
    }

    // Check if user already exists with this email
    let existingUser = await User.findOne({ email: guestUser.email });
    
    let userId;
    if (existingUser) {
      userId = existingUser._id;
      console.log('Using existing user:', userId);
    } else {
      // Create a new user with guest role/flag
      const newUser = await User.create({
        name: guestUser.name,
        email: guestUser.email,
        phone: guestUser.phone,
        isGuest: true, // Add this field to your User model
        role: 'guest'
      });
      userId = newUser._id;
      console.log('Created new guest user:', userId);
    }

    // Calculate totals
    let totalAmount = 0;
    const orderProducts = [];

    for (const item of products) {
      const product = await Product.findById(item.product);
      
      if (!product) {
        return res.status(400).json({
          success: false,
          message: `Product not found: ${item.product}`
        });
      }

      if (product.stock < item.quantity) {
        return res.status(400).json({
          success: false,
          message: `Insufficient stock for ${product.name}`
        });
      }

      const itemTotal = item.quantity * product.price;
      totalAmount += itemTotal;

      orderProducts.push({
        product: product._id,
        quantity: item.quantity,
        price: product.price
      });
    }

    const shippingFee = totalAmount > 500 ? 0 : 50;
    const taxAmount = totalAmount * 0.18;
    const finalAmount = totalAmount + shippingFee + taxAmount;

    console.log('Creating guest order with amounts:', { totalAmount, finalAmount });

    // Create order - DO NOT include orderId, let the pre-save hook generate it
    const order = new Order({
      isGuestOrder: true,
      user: userId, // Changed from guestUser to user
      products: orderProducts,
      shippingAddress,
      paymentMethod,
      paymentStatus: 'pending', // Set to pending for Razorpay
      orderStatus: 'pending', // Set to pending for Razorpay
      totalAmount,
      shippingFee,
      taxAmount,
      finalAmount
      // orderId will be auto-generated by pre-save hook
    });

    console.log('Order before save (orderId should be empty):', order.orderId);

    // Save the order - this will trigger the pre-save hook
    await order.save();

    console.log('Order after save (orderId should be generated):', order);

    // DON'T send email here for Razorpay payments
    // Email will be sent after successful payment verification
    if (paymentMethod === 'cod') {
      try {
        await sendOrderConfirmation(order._id);
        console.log('Order confirmation email sent successfully for COD guest order');
      } catch (emailError) {
        console.error('Order confirmation email failed:', emailError);
      }
    }

    res.json({
      success: true,
      message: 'Guest order created successfully',
      order,
      requiresPayment: paymentMethod !== 'cod'
    });

  } catch (error) {
    console.error('Create guest order error:', error);
    
    if (error.name === 'ValidationError') {
      const validationErrors = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: validationErrors
      });
    }
    
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

/* -------------------------------------------------------------------------- */
/* 🧩 7. Get guest order by ID                                                */
// @desc    Get guest order details
// @route   GET /api/payments/guest-order/:id
// @access  Public
export const getGuestOrder = async (req, res) => {
  try {
    const { id } = req.params;

    // Find guest order by ID or Razorpay order ID
    const guestOrder = await GuestOrder.findOne({
      $or: [
        { _id: id },
        { razorpay_order_id: id }
      ]
    });

    if (!guestOrder) {
      return res.status(404).json({
        success: false,
        message: 'Guest order not found'
      });
    }

    // Get payment details from Razorpay if payment exists
    let paymentDetails = null;
    if (guestOrder.razorpay_payment_id) {
      try {
        paymentDetails = await razorpay.payments.fetch(guestOrder.razorpay_payment_id);
      } catch (error) {
        console.error('Error fetching payment details:', error);
      }
    }

    res.status(200).json({
      success: true,
      guestOrder: {
        id: guestOrder._id,
        razorpay_order_id: guestOrder.razorpay_order_id,
        razorpay_payment_id: guestOrder.razorpay_payment_id,
        amount: guestOrder.amount,
        currency: guestOrder.currency,
        customer_name: guestOrder.customer_name,
        customer_email: guestOrder.customer_email,
        customer_phone: guestOrder.customer_phone,
        products: guestOrder.products,
        status: guestOrder.status,
        payment_details: paymentDetails,
        created_at: guestOrder.createdAt,
        updated_at: guestOrder.updatedAt
      }
    });
  } catch (error) {
    console.error('Get guest order error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching guest order',
      error: error.message
    });
  }
};

/* -------------------------------------------------------------------------- */
/* 🧩 8. Get Razorpay order details                                           */
/* -------------------------------------------------------------------------- */
export const getRazorpayOrderDetails = async (req, res) => {
  try {
    const { orderId } = req.params;
    console.log(req.params);
    
    const razorpayOrder = await razorpay.orders.fetch(orderId);
    
    res.json({
      success: true,
      order: razorpayOrder
    });
  } catch (error) {
    console.error('Get Razorpay order error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

/* -------------------------------------------------------------------------- */
/* 🧩 UTILITY: Generate guest password from email                              */
/* -------------------------------------------------------------------------- */
const generateGuestPassword = (email) => {
  try {
    if (!email || !email.includes('@')) {
      throw new Error('Invalid email address for password generation');
    }
    
    // Extract username part (before @)
    const usernamePart = email.split('@')[0];
    
    // Clean username - keep only letters and numbers, remove special characters
    const cleanUsername = usernamePart.replace(/[^a-zA-Z0-9]/g, '');
    
    // Take first 5 characters (or pad if shorter)
    let namePart;
    if (cleanUsername.length >= 5) {
      namePart = cleanUsername.substring(0, 5).toLowerCase();
    } else {
      // Pad with 'x' if username is shorter than 5 characters
      namePart = cleanUsername.toLowerCase();
      while (namePart.length < 5) {
        namePart += 'x';
      }
    }
    
    // Generate random number between 1 and 10
    const randomNum = Math.floor(Math.random() * 10) + 1;
    
    // Combine for exact 6 characters
    const password = namePart + randomNum;
    
    // Ensure it's exactly 6 characters (for cases where randomNum is 10)
    return password.substring(0, 6);
    
  } catch (error) {
    console.error('Password generation error:', error);
    // Fallback password
    return 'guest' + (Math.floor(Math.random() * 9) + 1);
  }
};