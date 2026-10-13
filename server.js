const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

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

// Initial Products Data
if (!fs.existsSync(productsFile) || readJSON(productsFile).length === 0) {
    const initialProducts = [
        { id: 1, name: "Addidas F50", category: "Football", subCategory: "Cleats", price: 16000, stock: 7, inStock: true, image: "https://images.unsplash.com/photo-1511886929837-354d827aae26?w=500" },
        { id: 2, name: "Trionda Fifa 2026 Football", category: "Football", subCategory: "Balls", price: 2700, stock: 9, inStock: true, image: "https://images.unsplash.com/photo-1614632537197-38a17061c2bd?w=500" },
        { id: 3, name: "Euro 2024 Original Football", category: "Football", subCategory: "Balls", price: 2500, stock: 9, inStock: true, image: "https://images.unsplash.com/photo-1579952363873-27f3bade9f55?w=500" },
        { id: 4, name: "Italy Spain Crazy Football", category: "Football", subCategory: "Balls", price: 2700, stock: 10, inStock: true, image: "https://images.unsplash.com/photo-1560272564-6694ea69185a?w=500" }
    ];
    writeJSON(productsFile, initialProducts);
}

// GET ALL PRODUCTS
app.get('/api/products', (req, res) => {
    res.json(readJSON(productsFile));
});

// CREATE ORDER
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

    res.json({ success: true, message: `Order Placed Successfully! Tracking Number: ${trackingNumber}`, trackingNumber });
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

// ADMIN: ADD PRODUCT
app.post('/api/admin/products/add', upload.single('productImage'), (req, res) => {
    if (req.body.token !== 'hussain123') return res.status(403).json({ success: false, message: "Unauthorized" });
    const { name, price, stock, category, subCategory } = req.body;
    const products = readJSON(productsFile);
    const newProd = {
        id: products.length > 0 ? Math.max(...products.map(p => p.id)) + 1 : 1,
        name,
        price: parseInt(price),
        stock: parseInt(stock) || 10,
        inStock: parseInt(stock) > 0,
        category,
        subCategory,
        image: req.file ? `/uploads/${req.file.filename}` : "https://images.unsplash.com/photo-1511886929837-354d827aae26?w=500"
    };
    products.push(newProd);
    writeJSON(productsFile, products);
    res.json({ success: true, message: "Product added successfully!" });
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
        res.status(404).json({ success: false, message: "Product not found" });
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

// ROOT ROUTE
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});