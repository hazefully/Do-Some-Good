var mongoose = require("mongoose");
var Schema = mongoose.Schema;

var LocationSchema = new Schema({
	// _id is a unique identifier to the entity
	sender_id: String,
  	name: {type: String, default: 'N/A'},
  	lat: {type: Number, default: 0},
  	long: {type: Number, default: 0},
 	date: { type: Date, default: Date.now },
 	description: {type: String, default: 'N/A'},
 	
 	hidden: { type: Boolean, default: false }, // if downvotes - upvotes > C hide him from the results of nearby locations
 												// inorder to unhide some one back he needs to gain some upvotes again
 	priority: {type: String, default: 'Low'}, // range from  1 to 10
 	upvotes: { type: Number, default: 0 },
 	downvotes: { type: Number, default: 0 }
});

module.exports = mongoose.model("location", LocationSchema);