var mongoose = require("mongoose");
var Schema = mongoose.Schema;

var EntrySchema = new Schema({
	// _id is a unique identifier to the entity
	type: {type: String, default: 'entry'},
	user_id: String,
  	name: {type: String, default: 'N/A'},
 	date: { type: Date, default: Date.now },
 	description: {type: String, default: 'N/A'},
 	
 	hidden: { type: Boolean, default: false }, // if downvotes - upvotes > C hide him from the results of nearby locations
 												// inorder to unhide some one back he needs to gain some upvotes again
 	priority: {type: String, default: 'Low'}, // range from  1 to 10
 	upvotes: [String],
 	downvotes: [String],
 	updates: [String],
 	updateDates: [String],
 	location : {
	    type: { 
			type: String,
			default: 'Point'
	    }, 
	    // [longitude, latitude]
	    coordinates: [Number]
  	}
});
EntrySchema.index({ location : '2dsphere' });

entry = mongoose.model("entry", EntrySchema);

module.exports.model = entry;
// maxDistance in meters
module.exports.queryByLocation = function(sessionObj, callback, msg) {
	entry.find(
	   {
	     location:
	       { $near :
	          {
	            $geometry: { type: "Point",  coordinates: [ sessionObj.long, sessionObj.lat ] },
	            //$minDistance: 1000,
	            //$maxDistance: 5000
	          }
	       }
	   },
	function (error, results) {
		callback(sessionObj, results, msg);
	});
}
module.exports.queryByName = function(sessionObj, callback, msg) {
	var expr = ".*";
	expr += sessionObj.queryval;
	expr+=".*";

	entry.find(
	   {
	   	 name: { $regex: expr, $options: 'i' }
	   },
	function (error, results) {
		callback(sessionObj, results, msg);
	});
}
module.exports.queryByDescription = function(sessionObj, callback, msg) {
	var expr = ".*";
	expr += sessionObj.queryval;
	expr+=".*";

	entry.find(
	   {
	   	 description: { $regex: expr, $options: 'i' }
	   },
	function (error, results) {
		callback(sessionObj, results, msg);
	});
}
