const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const nodemailer = require('nodemailer');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(__dirname));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

if (!fs.existsSync('./uploads')) {
    fs.mkdirSync('./uploads');
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, './uploads'),
    filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname))
});
const upload = multer({ storage });

const productsFile = './products.json';
const ordersFile = './orders.json';

function readJSON(file) {
    if (!fs.existsSync(file)) return [];
    try {
        return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (e) {
        return [];
    }
}

function writeJSON(file, data) {
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

if (!fs.existsSync(productsFile)) {
    writeJSON(productsFile, []);
}

// Nodemailer transporter setup for Email Alerts
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: 'tacazracee@gmail.com',
        pass: 'vasi lqsu hquw cwtw'
    }
});

// GET ALL PRODUCTS
app.get('/api/products', (req, res) => {
    res.json(readJSON(productsFile));
});

// CREATE ORDER WITH EMAIL & WHATSAPP NOTIFICATION
app.post('/api/orders', upload.single('paymentScreenshot'), (req, res) => {
    const { customerName, email, mobile, paymentMethod, address, items, date } = req.body;
    const parsedItems = JSON.parse(items || '[]');
    const orders = readJSON(ordersFile);
    const trackingNumber = 'HS-' + Math.floor(1000 + Math.random() * 9000) + '-PK';
    
    const newOrder = {
        id: orders.length + 1,
        trackingNumber,
        customerName,
        email,
        mobile,
        paymentMethod,
        address,
        items: parsedItems,
        status: 'Pending',
        paymentScreenshot: req.file ? `/uploads/${req.file.filename}` : null,
        date: date || new Date().toLocaleString()
    };

    orders.push(newOrder);
    writeJSON(ordersFile, orders);

    // Reduce stock
    const products = readJSON(productsFile);
    parsedItems.forEach(cartItem => {
        const prod = products.find(p => p.id === cartItem.id);
        if (prod) {
            prod.stock = Math.max(0, (prod.stock || 10) - cartItem.quantity);
            if (prod.stock === 0) prod.inStock = false;
        }
    });
    writeJSON(productsFile, products);

    // --- SEND EMAIL NOTIFICATION TO ADMIN ---
    let itemsSummary = parsedItems.map(i => `${i.name} (Qty: ${i.quantity})`).join('\n');
    const mailOptions = {
        from: 'tacazracee@gmail.com',
        to: 'tacazracee@gmail.com',
        subject: `🚨 New Order Received #${newOrder.id} - Hussain Sports`,
        text: `A new order has been placed!\n\nCustomer Name: ${customerName}\nMobile: ${mobile}\nEmail: ${email}\nPayment Method: ${paymentMethod}\nAddress: ${address}\nTracking Number: ${trackingNumber}\n\nItems:\n${itemsSummary}`
    };

    transporter.sendMail(mailOptions, (error, info) => {
        if (error) {
            console.error("Email send error:", error);
        } else {
            console.log("Email sent successfully:", info.response);
        }
    });

    // --- WHATSAPP NOTIFICATION LINK GENERATION ---
    let adminWhatsAppNumber = '923014446096';
    let waMessage = encodeURIComponent(`🚨 New Order #${newOrder.id}\nCustomer: ${newOrder.customerName}\nPhone: ${newOrder.mobile}\nPayment: ${newOrder.paymentMethod}\nTracking: ${trackingNumber}`);
    let whatsappTriggerUrl = `https://wa.me/${adminWhatsAppNumber}?text=${waMessage}`;

    res.json({ 
        success: true, 
        message: `Order Placed Successfully! Tracking Number: ${trackingNumber}`, 
        trackingNumber,
        whatsappLink: whatsappTriggerUrl
    });
});

// TRACK ORDER
app.get('/api/track/:trackingNumber', (req, res) => {
    const orders = readJSON(ordersFile);
    const order = orders.find(o => o.trackingNumber === req.params.trackingNumber);
    if (order) {
        res.json({ success: true, order });
    } else {
        res.json({ success: false, message: "Order not found with this tracking number!" });
    }
});

// ADMIN: FETCH ORDERS
app.post('/api/admin/orders', (req, res) => {
    if (req.body.token !== 'hussain123') return res.status(403).json({ success: false, message: "Unauthorized" });
    res.json({ success: true, orders: readJSON(ordersFile) });
});

// ADMIN: STATS & ANALYTICS API
app.post('/api/admin/stats', (req, res) => {
    if (req.body.token !== 'hussain123') return res.status(403).json({ success: false, message: "Unauthorized" });
    const products = readJSON(productsFile);
    const orders = readJSON(ordersFile);

    let totalSales = 0;
    let productSalesCount = {};

    orders.forEach(order => {
        if (order.status !== 'Cancelled') {
            let orderTotal = 0;
            if (order.items && Array.isArray(order.items)) {
                order.items.forEach(item => {
                    const sub = (item.price || 0) * (item.quantity || 1);
                    orderTotal += sub;
                    productSalesCount[item.name] = (productSalesCount[item.name] || 0) + (item.quantity || 1);
                });
            }
            totalSales += orderTotal;
        }
    });

    let topProduct = "No sales yet";
    let maxQty = 0;
    for (let [name, qty] of Object.entries(productSalesCount)) {
        if (qty > maxQty) {
            maxQty = qty;
            topProduct = `${name} (${maxQty} sold)`;
        }
    }

    res.json({
        success: true,
        totalSales: totalSales,
        topSellingProduct: topProduct
    });
});

// ADMIN: UPDATE ORDER STATUS
app.post('/api/admin/orders/status', (req, res) => {
    if (req.body.token !== 'hussain123') return res.status(403).json({ success: false, message: "Unauthorized" });
    const { orderId, status } = req.body;
    const orders = readJSON(ordersFile);
    const order = orders.find(o => o.id === parseInt(orderId));
    if (order) {
        order.status = status;
        writeJSON(ordersFile, orders);
        res.json({ success: true, message: "Status updated successfully!" });
    } else {
        res.status(404).json({ success: false, message: "Order not found" });
    }
});

// ADMIN: ADD PRODUCT WITH MULTIPLE IMAGES
app.post('/api/admin/products/add', upload.array('productImages', 4), (req, res) => {
    if (req.body.token !== 'hussain123') return res.status(403).json({ success: false, message: "Unauthorized" });
    const { name, price, stock, category, subCategory } = req.body;
    const products = readJSON(productsFile);

    let imagePaths = [];
    if (req.files && req.files.length > 0) {
        imagePaths = req.files.map(file => `/uploads/${file.filename}`);
    } else {
        imagePaths = ["https://images.unsplash.com/photo-1511886929837-354d827aae26?w=500"];
    }

    const newProd = {
        id: products.length > 0 ? Math.max(...products.map(p => p.id)) + 1 : 1,
        name,
        price: parseInt(price),
        stock: parseInt(stock) || 10,
        inStock: parseInt(stock) > 0,
        category,
        subCategory,
        image: imagePaths[0],
        images: imagePaths
    };

    products.push(newProd);
    writeJSON(productsFile, products);
    res.json({ success: true, message: "Product added successfully with gallery!" });
});

// ADMIN: STOCK INCREMENT / DECREMENT
app.post('/api/admin/products/stock', (req, res) => {
    if (req.body.token !== 'hussain123') return res.status(403).json({ success: false, message: "Unauthorized" });
    const { productId, change } = req.body;
    const products = readJSON(productsFile);
    const prod = products.find(p => p.id === parseInt(productId));
    if (prod) {
        prod.stock = Math.max(0, (prod.stock !== undefined ? prod.stock : 10) + parseInt(change));
        prod.inStock = prod.stock > 0;
        writeJSON(productsFile, products);
        res.json({ success: true, newStock: prod.stock });
    } else {
        res.status(404).json({ success: false, message: "Server error: Product not found" });
    }
});

// ADMIN: DELETE PRODUCT
app.post('/api/admin/products/delete', (req, res) => {
    if (req.body.token !== 'hussain123') return res.status(403).json({ success: false, message: "Unauthorized" });
    let products = readJSON(productsFile);
    products = products.filter(p => p.id !== parseInt(req.body.productId));
    writeJSON(productsFile, products);
    res.json({ success: true });
});

// ROUTES
app.get('/admin.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'admin.html'));
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});