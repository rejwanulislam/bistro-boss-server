const express = require('express')
const cors = require('cors')
require('dotenv').config()
const jwt = require('jsonwebtoken')
const app = express()
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY)

const port = process.env.PORT || 5000;

//midilware
app.use(cors())
app.use(express.json())
app.use(express.urlencoded())

const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const { default: axios } = require('axios')
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.0xslwlb.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

async function run() {
    try {
        const userCollection = client.db('bistroDB').collection('users')
        const menuCollection = client.db('bistroDB').collection('menu')
        const reviewsCollection = client.db('bistroDB').collection('reviews')
        const cartsCollection = client.db('bistroDB').collection('carts')
        const paymentCollection = client.db('bistroDB').collection('payment')

        //jwt relate api
        app.post('/jwt', async (req, res) => {
            const user = req.body
            const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, { expiresIn: 60 * 60 })
            res.send({ token })
        })

        const veryfyToken = (req, res, next) => {

            if (!req.headers.authorization) {
                return res.status(401).send({ message: 'forbidding access' })
            }
            const token = req.headers.authorization.split(' ')[1]
            jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
                if (err) {
                    return res.status(401).send({ message: 'forbidding access' })

                }
                req.decoded = decoded
                next()
            })

        }


        const verifyAdmin = async (req, res, next) => {
            const email = req.decoded.email
            const query = { email: email }
            const user = await userCollection.findOne(query)
            const isAdmin = user?.role == 'admin'
            if (!isAdmin) {
                return res.status(403).send({ message: 'forbidding access' })
            }
            next()
        }

        //User Collection
        app.post('/users', async (req, res) => {
            const user = req.body;
            const query = { email: user.email }
            const existingUser = await userCollection.findOne(query)
            if (existingUser) {
                return res.send({ message: 'user allrady exists', insertId: null })
            }
            const result = await userCollection.insertOne(user);
            res.send(result);
        })

        app.get('/users', veryfyToken, verifyAdmin, async (req, res) => {

            const result = await userCollection.find().toArray();
            res.send(result);
        })

        app.delete('/users/:id', veryfyToken, verifyAdmin, async (req, res) => {
            const id = req.params.id
            const query = { _id: new ObjectId(id) }
            const result = await userCollection.deleteOne(query)
            res.send(result)
        })

        //user admin
        app.get('/user/admin/:email', veryfyToken, async (req, res) => {
            const email = req.params.email
            if (email !== req.decoded.email) {
                return res.status(403).send({ message: 'forbidding access' })

            }
            const query = { email: email }
            const user = await userCollection.findOne(query)
            let admin = false
            if (user) {
                admin = user?.role == 'admin'
            }
            res.send({ admin })
        })
        app.patch('/user/admin/:id', veryfyToken, verifyAdmin, async (req, res) => {
            const id = req.params.id
            const filter = { _id: new ObjectId(id) }
            const updateedDoc = {
                $set: {
                    role: 'admin'
                }
            }
            const result = await userCollection.updateOne(filter, updateedDoc)
            res.send(result)
        })




        //Menu Collection
        app.get('/menu', async (req, res) => {
            const result = await menuCollection.find().toArray()
            res.send(result)
        })
        app.get('/menu/:id', async (req, res) => {
            const id = req.params.id
            const query = { _id: new ObjectId(id) }
            const result = await menuCollection.findOne(query)
            res.send(result)
        })

        app.post('/menu', veryfyToken, verifyAdmin, async (req, res) => {
            const item = req.body
            const result = await menuCollection.insertOne(item)
            res.send(result)
        })

        app.delete('/menu/:id', veryfyToken, verifyAdmin, async (req, res) => {
            const id = req.params.id
            const query = { _id: new ObjectId(id) }
            const result = await menuCollection.deleteOne(query)
            res.send(result)
        })

        app.patch('/menu/:id', async (req, res) => {
            const id = req.params.id
            const item = req.body
            const filter = { _id: new ObjectId(id) }
            const updateedDoc = {
                $set: {
                    name: item.name,
                    category: item.category,
                    recipe: item.recipe,
                    price: item.price,
                }
            }
            const result = await menuCollection.updateOne(filter, updateedDoc)
            res.send(result)
        })

        app.get('/reviews', async (req, res) => {
            const result = await reviewsCollection.find().toArray()
            res.send(result)
        })

        //Carts Collection
        app.post('/carts', async (req, res) => {
            const cartItem = req.body;
            const result = await cartsCollection.insertOne(cartItem)
            res.send(result)
        })
        app.get('/carts', async (req, res) => {
            const email = req.query.email
            const query = { email: email }
            const result = await cartsCollection.find(query).toArray()
            res.send(result)
        })

        app.delete('/carts/:id', async (req, res) => {
            const id = req.params.id
            const query = { _id: new ObjectId(id) }
            const result = await cartsCollection.deleteOne(query)
            res.send(result)
        })

        //create payment intent
        app.post('/create-payment-intent', async (req, res) => {
            const { price } = req.body
            const amount = parseInt(price * 100)
            console.log(amount)
            const paymentIntent = await stripe.paymentIntents.create({
                amount: amount,
                currency: 'usd',
                payment_method_types: ["card"],
                // automatic_payment_methods: {
                //     enabled: true
                // }
            })

            res.send({
                clientSecret: paymentIntent.client_secret
            })

        })

        //save payment info
        app.post('/payment', async (req, res) => {
            const payment = req.body
            const paymentResult = await paymentCollection.insertOne(payment)
            const query = {
                _id: {
                    $in: payment.cartId.map(id => new ObjectId(id))
                }
            }
            const deleteResult = await cartsCollection.deleteMany(query)

            res.send({ paymentResult, deleteResult })
        })

        app.get('/payment/:email', veryfyToken, async (req, res) => {
            const email = req.params.email
            if (email !== req.decoded.email) {
                res.status(403).send({ message: 'forbiden access' })
            }
            const query = { email: email }
            const result = await paymentCollection.find(query).toArray()
            res.send(result)
        })


        //sslcommerz payment
        app.post('/crect-ssl-payment', async (req, res) => {
            const data = req.body
            console.log(data)
            //manual genarate trxId
            const trxId = new ObjectId().toString()
            data.transationId = trxId
            const initiate = {
                store_id: 'bistr68b979343a402',
                store_passwd: 'bistr68b979343a402@ssl',
                total_amount: data?.price,
                currency: 'BDT',
                tran_id: trxId, // use unique tran_id for each api call
                success_url: 'http://localhost:5000/success-payment',
                fail_url: 'http://localhost:5173/fail',
                cancel_url: 'http://localhost:5173/cancel',
                ipn_url: 'http://localhost:5000/ipn-success-payment',
                shipping_method: 'Courier',
                product_name: 'Computer.',
                product_category: 'Electronic',
                product_profile: 'general',
                cus_name: `${data?.name}`,
                cus_email: `${data?.email}`,
                cus_add1: 'Dhaka',
                cus_add2: 'Dhaka',
                cus_city: 'Dhaka',
                cus_state: 'Dhaka',
                cus_postcode: '1000',
                cus_country: 'Bangladesh',
                cus_phone: '01711111111',
                cus_fax: '01711111111',
                ship_name: 'Customer Name',
                ship_add1: 'Dhaka',
                ship_add2: 'Dhaka',
                ship_city: 'Dhaka',
                ship_state: 'Dhaka',
                ship_postcode: 1000,
                ship_country: 'Bangladesh',
            };

            const inResponse = await axios({
                url: 'https://sandbox.sslcommerz.com/gwprocess/v4/api.php',
                method: "POST",
                data: initiate,
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded"
                }
            })
            const saveData = await paymentCollection.insertOne(data)

            const GatewayPageURL = inResponse?.data?.GatewayPageURL
            console.log(GatewayPageURL)
            res.send({ GatewayPageURL }, { saveData })
        })

        //success-payment
        app.post('/success-payment', async (req, res) => {
            const paymentSuccess = req.body

            const { data } = await axios.get(`https://sandbox.sslcommerz.com/validator/api/validationserverAPI.php?val_id=${paymentSuccess?.val_id}&store_id=bistr68b979343a402&store_passwd=bistr68b979343a402@ssl&format=json`)
            if (data.status !== 'VALID') {
                res.send({ message: 'In Valid Payment' })
            }
            const query = { transationId: data.tran_id }

            const updatePayment = await paymentCollection.updateOne(query, {
                $set: {
                    status: 'success'
                }
            })
            const payment = await paymentCollection.findOne(query)
            console.log(payment)
            const deletQuery = {
                _id: {
                    $in: payment.cartId.map(id => new ObjectId(id))

                }

            }
            const deletCart = await cartsCollection.deleteMany(deletQuery)
            res.redirect('http://localhost:5173/success')
            console.log(updatePayment, deletCart)
            res.send(deletCart)
        })



        //state or analytice
        app.get('/admin-stats', veryfyToken, verifyAdmin, async (req, res) => {
            const users = await userCollection.estimatedDocumentCount()
            const menuItems = await menuCollection.estimatedDocumentCount()
            const orders = await paymentCollection.estimatedDocumentCount()
            //  this is not best way
            // const payment = await paymentCollection.find().toArray()
            // const revenue = payment.reduce((total, payment) => total + payment.price, 0)

            //best way
            const result = await paymentCollection.aggregate([
                {
                    $group: {
                        _id: null,
                        totalRevenue: {
                            $sum: '$price'
                        }
                    }
                },
            ]).toArray()
            const revenue = result.length > 0 ? result[0].totalRevenue : 0;
            res.send({
                users,
                menuItems,
                orders,
                revenue,
            })
        })
        //order status
        app.get('/order-stats', veryfyToken, verifyAdmin, async (req, res) => {
            const result = await paymentCollection.aggregate([
                {
                    $unwind: '$menuId'
                },
                {
                    $lookup: {
                        from: 'menu',
                        localField: 'menuId',
                        foreignField: '_id',
                        as: 'menuItems'
                    }
                },
                {
                    $unwind: '$menuItems'
                },
                {
                    $group: {
                        _id: '$menuItems.category',
                        quantity: {
                            $sum: 1
                        },
                        revenue: {
                            $sum: '$menuItems.price'
                        }
                    }
                },
                {
                    $project: {
                        _id: 0,
                        category: '$_id',
                        quantity: '$quantity',
                        revenue: '$revenue'
                    }
                }
            ]).toArray()
            res.send(result)
        })


        // Connect the client to the server	(optional starting in v4.7)
        // await client.connect();
        // // Send a ping to confirm a successful connection
        // await client.db("admin").command({ ping: 1 });
        // console.log("Pinged your deployment. You successfully connected to MongoDB!");
    } finally {
        // Ensures that the client will close when you finish/error
        //await client.close();
    }
}
run().catch(console.dir);



app.get('/', (req, res) => {
    res.send('Boss is sitting')
})
app.listen(port, () => {
    console.log(`Bistro Boss is sitting on the ${port}`)
})