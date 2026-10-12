const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');

const app = express();
const PORT = 3000;
const ADMIN_SECRET = 'hussain123';

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(__dirname));

// MongoDB Atlas Standard Connection
const MONGO_URI = 'mongodb://tacazracee_db_user:hussain123@ac-gq65dhr-shard-00-00.xpt6ngj.mongodb.net:27017,ac-gq65dhr-shard-00-01.xpt6ngj.mongodb.net:27017,ac-gq65dhr-shard-00-02.xpt6ngj.mongodb.net:27017/hussain_sports?ssl=true&replicaSet=atlas-14kb9i-shard-0&authSource=admin&appName=Cluster0';

mongoose.connect(MONGO_URI)
    .then(() => console.log('✅ Connected to MongoDB Atlas successfully!'))
    .catch(err => console.error('❌ MongoDB connection error:', err));

// Mongoose Schemas & Models
const productSchema = new mongoose.Schema({
    id: { type: Number, unique: true },
    name: String,
    price: Number,
    stock: { type: Number, default: 10 },
    category: String,
    subCategory: String,
    inStock: { type: Boolean, default: true },
    image: String
});

const orderSchema = new mongoose.Schema({
    id: { type: Number, unique: true },
    trackingNumber: String,
    items: Array,
    customerName: String,
    email: String,
    paymentMethod: String,
    mobile: String,
    address: String,
    status: { type: String, default: 'Pending' },
    date: String
});

const Product = mongoose.model('Product', productSchema);
const Order = mongoose.model('Order', orderSchema);

// Ensure uploads directory exists
const uploadDir = path.join(__dirname, 'public/uploads/');
if (!fs.existsSync(uploadDir)){
    fs.mkdirSync(uploadDir, { recursive: true });
}
const upload = multer({ dest: uploadDir });

// --- API ROUTES ---

// Public: Get Products
app.get('/api/products', async (req, res) => {
    try {
        const products = await Product.find({});
        res.json(products);
    } catch (err) {
        res.status(500).json({ message: 'Error fetching products' });
    }
});

// Admin Authentication Route
app.post('/api/admin/verify', (req, res) => {
    const { password } = req.body;
    if (password === ADMIN_SECRET) {
        res.json({ success: true, token: ADMIN_SECRET });
    } else {
        res.status(401).json({ success: false, message: 'Invalid Password' });
    }
});

// Public: Place Order (With Robust Stock Decrement by ID or Name)
app.post('/api/orders', async (req, res) => {
    try {
        const count = await Order.countDocuments();
        const newId = count > 0 ? (await Order.findOne().sort({ id: -1 })).id + 1 : 1;
        
        const randomNum = Math.floor(1000 + Math.random() * 9000);
        const trackingNumber = `HS-${randomNum}-PK`;

        const { items, customerName, email, paymentMethod, mobile, address, date } = req.body;

        // Automatically decrement stock for each ordered item
        if (items && Array.isArray(items)) {
            for (let item of items) {
                let orderedQty = item.quantity || 1;
                // Pehle ID se search karein, agar na mile toh Name se match karein
                let product = await Product.findOne({ 
                    $or: [
                        { id: Number(item.id) },
                        { name: item.name }
                    ]
                });

                if (product) {
                    product.stock = Math.max(0, (product.stock || 10) - orderedQty);
                    product.inStock = product.stock > 0;
                    await product.save();
                }
            }
        }

        const newOrder = new Order({
            id: newId,
            trackingNumber,
            items: items || [],
            customerName: customerName || 'Guest Customer',
            email: email || 'N/A',
            paymentMethod: paymentMethod || 'COD',
            mobile: mobile || 'N/A',
            address: address || 'N/A',
            status: 'Pending',
            date: date || new Date().toLocaleString()
        });

        await newOrder.save();
        res.json({ 
            message: `Order placed successfully! Tracking Number: ${trackingNumber}`, 
            trackingNumber: trackingNumber 
        });
    } catch (err) {
        console.error("Error saving order:", err);
        res.status(500).json({ message: 'Failed to place order.' });
    }
});

// Public: Track Order
app.get('/api/track/:trackingNum', async (req, res) => {
    try {
        const trackingNum = req.params.trackingNum;
        const order = await Order.findOne({ trackingNumber: new RegExp('^' + trackingNum + '$', 'i') });
        
        if (order) {
            res.json({ success: true, order });
        } else {
            res.status(404).json({ success: false, message: `No order found with tracking number: ${trackingNum}` });
        }
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// Admin: Get All Orders & Dashboard Stats
app.post('/api/admin/orders', async (req, res) => {
    const { token } = req.body;
    if (token !== ADMIN_SECRET) {
        return res.status(403).json({ success: false, message: 'Unauthorized access!' });
    }

    try {
        const orders = await Order.find({}).sort({ id: -1 });
        let totalOrders = orders.length;
        let totalSales = 0;
        let productCounts = {};

        orders.forEach(order => {
            if (order.items && Array.isArray(order.items)) {
                order.items.forEach(item => {
                    let qty = item.quantity || 1;
                    let subTotal = (parseFloat(item.price) || 0) * qty;
                    totalSales += subTotal;
                    
                    const prodName = item.name || 'Unknown Item';
                    productCounts[prodName] = (productCounts[prodName] || 0) + qty;
                });
            }
        });

        let topProduct = 'N/A';
        let maxCount = 0;
        for (let [name, count] of Object.entries(productCounts)) {
            if (count > maxCount) {
                maxCount = count;
                topProduct = `${name} (${maxCount} sold)`;
            }
        }

        res.json({
            success: true,
            orders,
            stats: { totalOrders, totalSales, topProduct }
        });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Error loading orders' });
    }
});

// Admin: Update Order Status
app.post('/api/admin/orders/status', async (req, res) => {
    const { token, orderId, status } = req.body;
    if (token !== ADMIN_SECRET) return res.status(403).json({ success: false });

    try {
        const order = await Order.findOneAndUpdate({ id: parseInt(orderId) }, { status: status || 'Pending' });
        if (order) {
            res.json({ success: true, message: 'Order status updated successfully!' });
        } else {
            res.status(404).json({ success: false, message: 'Order not found!' });
        }
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// Admin: Add Product (Quantity ke sath)
app.post('/api/admin/products/add', upload.single('productImage'), async (req, res) => {
    const token = req.body.token;
    if (token !== ADMIN_SECRET) return res.status(403).json({ success: false, message: 'Unauthorized' });

    try {
        let imagePath = 'https://images.unsplash.com/photo-1461896836934-ffe607ba8211?w=500';
        if (req.file) {
            imagePath = `/public/uploads/${req.file.filename}`;
        }

        const stockQty = Number(req.body.stock || 10);
        const newProduct = new Product({
            id: Date.now(),
            name: req.body.name,
            price: Number(req.body.price),
            stock: stockQty,
            category: req.body.category,
            subCategory: req.body.subCategory,
            image: imagePath,
            inStock: stockQty > 0
        });

        await newProduct.save();
        res.json({ success: true, message: 'Product added successfully!' });
    } catch (err) {
        console.error("Error adding product:", err);
        res.status(500).json({ success: false, message: 'Failed to add product' });
    }
});

// Admin: Update Product Stock (Increment / Decrement / Restock)
app.post('/api/admin/products/stock', async (req, res) => {
    const { token, productId, change } = req.body;
    if (token !== ADMIN_SECRET) return res.status(403).json({ success: false, message: 'Unauthorized' });

    try {
        let product = await Product.findOne({ id: Number(productId) });
        if (!product) return res.status(404).json({ success: false, message: 'Product not found' });

        let currentStock = product.stock !== undefined ? product.stock : 10;
        let newStock = Math.max(0, currentStock + Number(change || 0));

        product.stock = newStock;
        product.inStock = newStock > 0;
        await product.save();

        res.json({ success: true, message: 'Stock updated successfully!', stock: product.stock });
    } catch (err) {
        console.error("Error updating stock:", err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// Admin: Delete Product
app.post('/api/admin/products/delete', async (req, res) => {
    const { token, productId } = req.body;
    if (token !== ADMIN_SECRET) return res.status(403).json({ success: false });

    try {
        await Product.findOneAndDelete({ id: parseInt(productId) });
        res.json({ success: true, message: 'Product deleted!' });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Failed to delete product' });
    }
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});