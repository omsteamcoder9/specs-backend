import express from 'express';
import {
  createShipment,
  shipRocketLogin,
  getPickupLocations,
  getCourierServiceability,
  getServiceabilityByOrder,
  getOrderShipment,           
  getAllShipments,            
  getShipmentStatistics,
  trackShipmentById,
  cancelShipment // ✅ ADD CANCELLATION IMPORT
} from '../controller/shippingController.js';
import { protect, admin } from '../middleware/authMiddleware.js';

const router = express.Router();

// Existing routes
router.post('/orders/:orderId/shipment', protect, admin, createShipment);
router.get('/login', protect, admin, shipRocketLogin);
router.get('/pickup-locations', protect, admin, getPickupLocations);
router.get('/serviceability', protect, admin, getCourierServiceability);
router.get('/orders/:orderId/serviceability', protect, admin, getServiceabilityByOrder);

// ✅ ADMIN SHIPMENT ROUTES
router.get('/orders/:orderId/shipment', protect, admin, getOrderShipment);
router.get('/shipments', protect, admin, getAllShipments);
router.get('/statistics', protect, admin, getShipmentStatistics);
router.get('/track/:shipmentId', protect, admin, trackShipmentById);

// ✅ CANCELLATION ROUTE
router.post('/orders/:orderId/cancel', protect, admin, cancelShipment);

export default router;