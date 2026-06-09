const mongoose = require('mongoose');

const blacklistSchema = new mongoose.Schema({
    token: {
        type: String,
        required: [true, 'Token is required']
    },
   
}, {
    timestamps: true
})

blacklistSchema.index({ createdAt: 1 }, {
    expireAfterSeconds:60*60*24*7 // to automatically remove expired tokens after 7 days
}); 




const Blacklist = mongoose.model('Blacklist', blacklistSchema);

module.exports = Blacklist;
