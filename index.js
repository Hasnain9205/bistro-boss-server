const express = require('express')
const app = express()
const jwt = require('jsonwebtoken')
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
require('dotenv').config()
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY)
const cors = require('cors');
const { useController } = require('react-hook-form');
const port = process.env.PORT || 5000

//middleWare
app.use(cors())
app.use(express.json())



const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.0tzjsyp.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

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
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();
    
    const usersCollection = client.db('BristroDB').collection('users');
    const menuCollection = client.db('BristroDB').collection('menu');
    const reviewsCollection = client.db('BristroDB').collection('reviews');
    const cartsCollection = client.db('BristroDB').collection('carts');
    const paymentsCollection = client.db('BristroDB').collection('payments');

    //jwt related api;
    app.post('/jwt',async(req,res)=>{
    const user = req.body;
    const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '24h' })
    res.send({token})
  })


  //middlewares
  const verifyToken = (req,res,next)=>{
    console.log('inside verify token',req.headers.authorization)
    if(!req.headers.authorization){
      return res.status(401).send({message:'unauthorized access'})
    }
    const token = req.headers.authorization.split(' ')[1];
    jwt.verify(token,process.env.ACCESS_TOKEN_SECRET, (err,decoded)=>{
      if(err){
        return res.status(401).send({message: 'unauthorized access'})
      }
      req.decoded = decoded;
      next()
    })
  }

  // use verify admin after verify token
  const verifyAdmin = async(req,res,next)=>{
    const email = req.decoded.email;
    const query = {email: email};
    const user = await usersCollection.findOne(query);
    const isAdmin = user?.role === 'Admin';
    if(!isAdmin){
      return res.status(403).send({message: 'forbidden access'})
    }
    next();
  }


    //users related api
    app.get('/users',verifyToken,verifyAdmin,async(req,res)=>{
      const result = await usersCollection.find().toArray()
      res.send(result);
    })

    app.get('/users/admin/:email', verifyToken, async(req,res) => {
      const email = req.params.email;
      if(email !== req.decoded.email){
        return res.status(403).send({message: 'forbidden access'})
      }
      const query = {email: email};
      const user = await usersCollection.findOne(query);
      let Admin = false;
      if(user){
        Admin = user?.role === 'Admin';
      }
      res.send({ Admin })
    })

    app.post('/users',async(req,res)=>{
      const user = req.body;
      //insert email if user does not exists
      //you can do this many ways (email unique,upsert,simple checking);
      const query = {email:user.email}
      const existingUser = await usersCollection.findOne(query);
      if(existingUser){
        return res.send({message: 'user already exists', insertedId: null})
      }
      const result = await usersCollection.insertOne(user);
      res.send(result);
    })

    app.patch('/users/admin/:id',verifyToken,verifyAdmin,async(req,res)=>{
      const id = req.params.id;
      const filter = {_id: new ObjectId(id)};
      const updatedDoc = {
        $set:{
          role:'Admin'
        }
      }
      const result = await usersCollection.updateOne(filter,updatedDoc);
      res.send(result);
    })

    app.delete('/users/:id',verifyToken,verifyAdmin,async(req,res)=>{
      const id = req.params.id;
      const query = {_id: new ObjectId(id)};
      const result = await usersCollection.deleteOne(query);
      res.send(result);
    })
    
//get all data from menu
    app.get('/menu',async(req,res)=>{
        const result = await menuCollection.find().toArray()
        res.send(result);
    })
    //get single data from menu
    app.get('/menu/:id', async (req, res)=>{
      const id = req.params.id
      const query = { _id: new ObjectId(id) }
      const result = await menuCollection.findOne(query)
      res.send(result);
    });


      app.post('/menu',verifyToken,verifyAdmin,async(req,res)=>{
      const item = req.body;
      const result = await menuCollection.insertOne(item);
      res.send(result)
    })

    app.delete('/menu/:id',verifyToken,verifyAdmin,async(req,res)=>{
      const id = req.params.id;
      console.log({id})
      const query = {_id: new ObjectId(id)};
      const data = await menuCollection.findOne(query)
      console.log({userData:data})
      const result = await menuCollection.deleteOne(query);
      res.send(result)
    })
    app.patch('/menu/:id',async(req,res)=>{
      try {
        const updateMenu = req.body;
        const id = req.params.id;
        const filter = {_id: new ObjectId(id)};
        const update = {
            $set: {
                name:updateMenu.name,
                category:updateMenu.category,
                price:updateMenu.price,
                recipe:updateMenu.recipe
    
            }
        }
        const result = await menuCollection.updateOne(filter,update);
        res.send(result)
      } catch (error) {
        console.log("update menu",error)
      }
    })
//get all data from reviews
    app.get('/reviews',async(req,res)=>{
      try {
        const result = await reviewsCollection.find().toArray()
        res.send(result);
      } catch (error) {
        console.log('get menu error',error)
      }
    })
    //carts collection
    app.get('/carts',async(req,res)=>{
      const email = req.query.email;
      const query = {email:email};
      const result = await cartsCollection.find(query).toArray()
      res.send(result)
    })
    app.post('/carts',async(req,res) =>{
      const cartItem = req.body;
      const result = await cartsCollection.insertOne(cartItem);
      res.send(result);
    })
    app.delete('/carts/:id',async(req,res)=>{
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await cartsCollection.deleteOne(query)
      res.send(result)
    })

    //Payment intent;
    app.post('/create-payment-intent', async(req,res)=>{
      const { price } = req.body;
      const amount = parseInt(price * 100);
      console.log(amount)
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: 'usd',
        payment_method_types: ['card']
      });
      res.send({
        clientSecret: paymentIntent.client_secret
      })
    })
    
    app.get('/payments/:email',verifyToken, async (req,res)=>{
      const query = {email:req.params.email}
      if(req.params.email !== req.decoded.email){
        return res.status(403).send({message: 'forbidden access'})
      }
      const result = await paymentsCollection.find(query).toArray();
      res.send(result)
    })

    app.post('/payments', async(req,res)=>{
      const payment = req.body;
      const paymentResult = await paymentsCollection.insertOne(payment)
      console.log('payment info',payment)
      const query = {_id: {
        $in: payment.cartIds.map(id => new ObjectId(id))
      }}
      const deleteResult = await cartsCollection.deleteMany(query)
      res.send({paymentResult,deleteResult})
    })


    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);


app.get('/',async(req,res)=>{
    res.send('Boss is setting')
})

app.listen(port, () =>{
    console.log(`Bistro Boss is setting in port ${port}`)
})
