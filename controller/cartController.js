// controllers/cartController.js
import Cart from '../models/cartModel.js';
import Product from '../models/productModel.js';
import mongoose from 'mongoose';

// Add to Cart
// In cartController.js - Add debug logs
export const addToCart = async (req, res) => {
  try {
    const { productId, quantity = 1, color } = req.body; // ✅ UPDATED: Changed from size to color
    const userId = req.user._id;

    console.log('🛒 Backend - addToCart request:', {
      userId,
      productId,
      quantity,
      color,
      body: req.body,
      user: req.user
    });

    // Validate product ID
    if (!mongoose.Types.ObjectId.isValid(productId)) {
      console.error('❌ Invalid product ID:', productId);
      return res.status(400).json({
        success: false,
        message: 'Invalid product ID'
      });
    }

    // Check if product exists
    const product = await Product.findById(productId);
    if (!product) {
      console.error('❌ Product not found:', productId);
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    console.log('✅ Product found:', {
      name: product.name,
      stock: product.stock,
      colors: product.colors
    });

    // ✅ UPDATED: Check stock for specific color if provided
    let availableStock = product.stock;
    if (color && product.colors && product.colors.length > 0) {
      const selectedColorObj = product.colors.find(c => c.name === color);
      console.log('🎨 Color check:', {
        requestedColor: color,
        availableColors: product.colors,
        selectedColorObj
      });
      
      if (selectedColorObj) {
        availableStock = selectedColorObj.stock;
      }
    }

    console.log('📦 Stock check:', {
      availableStock,
      requestedQuantity: quantity
    });

    // Check stock availability
    if (availableStock < quantity) {
      console.error('❌ Insufficient stock:', { availableStock, quantity });
      return res.status(400).json({
        success: false,
        message: 'Insufficient stock'
      });
    }

    // Find or create cart for user
    let cart = await Cart.findOne({ user: userId });
    console.log('🛍️ Existing cart:', cart ? 'Found' : 'Not found');

    if (!cart) {
      cart = new Cart({
        user: userId,
        items: []
      });
      console.log('🆕 Created new cart');
    }

    // ✅ UPDATED: Check if product already in cart with same color
    const existingItemIndex = cart.items.findIndex(
      item => item.product.toString() === productId && item.selectedColor === color
    );

    console.log('🔍 Checking existing items:', {
      totalItems: cart.items.length,
      existingItemIndex,
      searchCriteria: { productId, color }
    });

    if (existingItemIndex > -1) {
      // Update quantity if product exists with same color
      const newQuantity = cart.items[existingItemIndex].quantity + quantity;
      
      if (availableStock < newQuantity) {
        console.error('❌ Insufficient stock for increased quantity:', { availableStock, newQuantity });
        return res.status(400).json({
          success: false,
          message: 'Insufficient stock for requested quantity'
        });
      }
      
      cart.items[existingItemIndex].quantity = newQuantity;
      console.log('📈 Updated existing item quantity:', newQuantity);
    } else {
      // ✅ FIXED: Add new item to cart WITH PRICE
      cart.items.push({
        product: productId,
        quantity,
        price: product.price, // ✅ CRITICAL: Add price field
        selectedColor: color || '' // ✅ UPDATED: Add selected color
      });
      console.log('➕ Added new item to cart:', {
        product: productId,
        quantity,
        price: product.price,
        selectedColor: color || ''
      });
    }

    await cart.save();
    console.log('💾 Cart saved to database');
    
    // Populate product details
    await cart.populate('items.product', 'name price images slug stock colors');
    console.log('✅ Cart populated with product details');

    // ✅ Return cart directly (not wrapped in data object)
    res.status(200).json(cart);

  } catch (error) {
    console.error('❌ Add to Cart Error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Get Cart
export const getCart = async (req, res) => {
  try {
    const userId = req.user._id;

    const cart = await Cart.findOne({ user: userId })
      .populate('items.product', 'name price images slug seller stock colors');

    if (!cart) {
      // ✅ FIXED: Return proper empty cart structure that matches frontend Cart type
      return res.status(200).json({
        _id: 'empty-cart',
        user: userId,
        items: [],
        totalPrice: 0, // ✅ Changed from totalAmount to totalPrice
        totalItems: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
    }

    // ✅ FIXED: Return cart directly (not wrapped in data object)
    res.status(200).json(cart);

  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Update Cart Item Quantity
export const updateCartItem = async (req, res) => {
  try {
    const { itemId } = req.params;
    const { quantity } = req.body;
    const userId = req.user._id;

    if (!quantity || quantity < 1) {
      return res.status(400).json({
        success: false,
        message: 'Quantity must be at least 1'
      });
    }

    const cart = await Cart.findOne({ user: userId });
    if (!cart) {
      return res.status(404).json({
        success: false,
        message: 'Cart not found'
      });
    }

    const cartItem = cart.items.id(itemId);
    if (!cartItem) {
      return res.status(404).json({
        success: false,
        message: 'Cart item not found'
      });
    }

    // ✅ UPDATED: Check stock for specific color
    const product = await Product.findById(cartItem.product);
    let availableStock = product.stock;
    
    if (cartItem.selectedColor && product.colors && product.colors.length > 0) {
      const selectedColorObj = product.colors.find(c => c.name === cartItem.selectedColor);
      if (selectedColorObj) {
        availableStock = selectedColorObj.stock;
      }
    }

    // Check stock availability
    if (availableStock < quantity) {
      return res.status(400).json({
        success: false,
        message: 'Insufficient stock'
      });
    }

    cartItem.quantity = quantity;
    await cart.save();
    
    await cart.populate('items.product', 'name price images slug seller stock colors');

    // ✅ FIX: Return cart directly (not wrapped in data object)
    res.status(200).json(cart);

  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Remove Item from Cart
export const removeFromCart = async (req, res) => {
  try {
    const { itemId } = req.params;
    const userId = req.user._id;

    const cart = await Cart.findOne({ user: userId });
    if (!cart) {
      return res.status(404).json({
        success: false,
        message: 'Cart not found'
      });
    }

    // ✅ FIX: Find the item first and ensure it has price
    const cartItem = cart.items.id(itemId);
    if (!cartItem) {
      return res.status(404).json({
        success: false,
        message: 'Cart item not found'
      });
    }

    // ✅ FIX: Remove the item using pull
    cart.items.pull(itemId);
    
    // ✅ FIX: Recalculate totals manually to ensure validation passes
    cart.totalItems = cart.items.reduce((total, item) => total + item.quantity, 0);
    cart.totalPrice = cart.items.reduce((total, item) => {
      // Ensure each item has price, use 0 as fallback
      const itemPrice = item.price || 0;
      return total + (itemPrice * item.quantity);
    }, 0);

    await cart.save();
    
    await cart.populate('items.product', 'name price images slug seller stock colors');

    // ✅ FIX: Return cart directly
    res.status(200).json(cart);

  } catch (error) {
    console.error('Remove from cart error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Clear Cart
export const clearCart = async (req, res) => {
  try {
    const userId = req.user._id;

    const cart = await Cart.findOne({ user: userId });
    if (!cart) {
      return res.status(404).json({
        success: false,
        message: 'Cart not found'
      });
    }

    cart.items = [];
    await cart.save();

    res.status(200).json({  
      success: true,
      message: 'Cart cleared successfully',
      data: cart
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};