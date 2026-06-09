const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');


const userSchema = new mongoose.Schema({
    email: {
        type: String,
        required: [true, "Email is required"],
        unique: true,
        trim: true,
        lowercase: true,
        match: [/\S+@\S+\.\S+/, "Please use a valid email address"]
    },
    name:{
        type: String,
        required: [true, "Name is required"],
        trim: true
    },
    password: {
        type: String,
        required: [true, "Password is required"],
        minlength: [6, "Password must be at least 6 characters long"],
        select: false // Do not return password by default when querying user
    },
    systemUser:{
        type: Boolean,
        default: false,
        immutable: true,
        select: false
    }
 }, {
        timestamps: true
    })


// when user is created or password is modified, hash the password before saving to database
userSchema.pre('save', async function(){
    if(!this.isModified('password')){
        return;
    }
   const hash= await bcrypt.hash(this.password, 10);
   this.password=hash;

   return;
   
})

userSchema.methods.comparePassword= async function(password){
    return await bcrypt.compare(password, this.password);
}

const UserModel= mongoose.model('User', userSchema);

module.exports=UserModel;