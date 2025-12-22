import express from "express";
import {
  addToCart,
  getCart,
  updateCartItem,
  removeFromCart,
  clearCart
} from "../controller/cartController.js";
import { protect, authorize } from "../middleware/authMiddleware.js";

const router = express.Router();

// ✅ All cart routes require authentication and must be 'user' role
router.use(protect, authorize("user"));

// ✅ Add to cart / Get cart / Clear entire cart
router.route("/")
  .post(addToCart)
  .get(getCart)
  .delete(clearCart);

// ✅ Update or remove specific cart item
router.route("/items/:itemId")
  .put(updateCartItem)
  .delete(removeFromCart);

export default router;

