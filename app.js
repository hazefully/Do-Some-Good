var express = require("express");
var request = require("request");
var bodyParser = require("body-parser");
var mongoose = require("mongoose");
var regex = require("regex");
// util for debugging purposes
const util = require("util");

var db = mongoose.connect(process.env.MONGODB_URI);

var location = require("./models/location");
//var extras = require("./models/extras");
var session = require("./models/session");


// testing database
/*
var sessionTest = new session.model({sender_id: '123456789'});
sessionTest.new_entry = new location({sender_id: '123456789'});
sessionTest.markModified('new_entry');
sessionTest.save(function(err) {
	if(err) {
		console.error("can't save sesisonTest :", err);
	}
	else {
		console.log("sessionTest saved Successfully");
	}
	console.log(sessionTest);
	console.log(util.inspect(sessionTest, false, null));
	console.log("-------------------------");
	console.log(sessionTest.new_entry);
	console.log(util.inspect(sessionTest.new_entry, false, null));
});*/







var app = express();
app.use(bodyParser.urlencoded({extended: false}));
app.use(bodyParser.json());
// server index page
app.get("/", function (req, res) {
	res.send("Deployed!");
});

// Facebook Webhook
// Used for verification
app.get("/webhook", function (req, res) {
  if (req.query["hub.verify_token"] === process.env.VERIFICATION_TOKEN) {
    console.log("Verified webhook");
    res.status(200).send(req.query["hub.challenge"]);
  } else {
    console.error("Verification failed. The tokens do not match.");
    res.sendStatus(403);
  }
});
app.post('/webhook', function (req, res) {
	var data = req.body;

	if (data.object === 'page') {

		// Iterate over each entry - there may be multiple if batched
		data.entry.forEach(function (entry) {
			var pageID = entry.id;
			var timeOfEvent = entry.time;

			//Iterate over each messaging event
			entry.messaging.forEach(function(event) {
				console.log(event);
				if(event.message) {
					session.start(event, processMessage);
					//receivedMessage(event);
				} else if(event.postback) {
		            session.start(event, processPostback);
		            // console.log("I am supposed to handle something here?!");
		            //processPostback(event);
				}
				else {
					//console.log("Webhook recieved unknown event: ", event);
					console.log("Webhook recieved unknown event!");
				}
			});
		});
		res.sendStatus(200);
	}
});

function processMessage(event, sessionObj) {
  var senderID = event.sender.id;
  var recipientID = event.recipient.id;
  var timeOfMessage = event.timestamp;
  var message = event.message;

  console.log("Received message for user %d and page %d at %d with message:", 
    senderID, recipientID, timeOfMessage);
  //console.log(JSON.stringify(message));

  var messageId = message.mid;

  var messageText = message.text;
  var messageAttachments = message.attachments;

  if (messageText) {

    // If we receive a text message, check to see if it matches a keyword
    // and send back the example. Otherwise, just echo the text we received.
    if(messageText === 'generic')
    	sendGenericMessage(senderID);
    else
    	createNewEntry(event, sessionObj);

  } else if (messageAttachments) {
	    if(sessionObj.step === 3)
	    	createNewEntry(event, sessionObj);
	    else
	    	sendTextMessage(senderID, "Message with attachment received");

  }
}



function processPostback(event, sessionObj) {
  var senderId = event.sender.id;
  var payload = event.postback.payload;
  console.log(payload);
  if (payload == "Greeting") {
    getStarted(event, sessionObj, true);
  }
  else if (payload == "NewEntry"){
  	sessionObj.step = 1;
    createNewEntry(event, sessionObj);
  }
  else if (payload == "ListEntries"){
    listEntries(senderId, 0);
  }
  else if (payload == "UpdateStatus"){

  }
  else if (payload == "ViewEntry"){

  }
  else if (payload == "ViewMore"){

  }
  else if (payload == "HighPriority"){

  }
  else if (payload == "LowPriority"){

  }
  else if (payload == "MediumPriority"){

  }
  else if (payload == "ConfirmNewEntry"){
  	sendTextMessage(senderId, "Thank you! Your efforts will help make this world a better world!");
  	sendGenericMessage(event, sessionObj);
  }
  else if (payload == "CancelNewEntry"){
    sendTextMessage(senderId, "Your entry has been cancelled, please try again.");
    sendGenericMessage(event, sessionObj); 
  }
  else {
  	getStarted(event, sessionObj);
  }
}

function listEntries(senderId, offset)
{
  var list = [
  {
    priority: "HIGH",
    description: "loolohkmfkmnhdfnhnfslnhfd"
  },
  {
    priority: "LOW",
    description: "fslmfsknfsmfls"
  },
    {
    priority: "LOW",
    description: "fslmfsknfsmfls"
  },
    {
    priority: "LOW",
    description: "fslmfsknfsmfls"
  },
    {
    priority: "LOW",
    description: "fslmfsknfsmfls"
  },
    {
    priority: "LOW",
    description: "fslmfsknfsmfls"
  },
    {
    priority: "LOW",
    description: "fslmfsknfsmfls"
  }
  ]; //hatly de mn el database
  var elms = [];

  var btns = [
  {
    title: "View More",
    type: "postback",
    payload: "ViewMore"
  }
  ];
  
  if(list.length - offset + 1 < 5)
    btns = [];

  for(var i = offset ; i < list.length && i < 4 ; i++)
  {
    var titlle = list[i].description;
    var subtitlle = list[i].priority;
    elms.push({
        title: titlle,
        subtitle: subtitlle,

        buttons: [
        {
          title: "View",
          type: "postback",
          payload: "ViewEntry"
        }
        ]
    })
  }
  console.log(elms);
  var messageData = {
    recipient:{
      id: senderId
    },
    message:{
      attachment:{
        type : "template",
        payload:{
          template_type: "list",
          top_element_style: "compact",
          elements: elms,
          buttons: btns
        }
      }
    }

  }
  callSendAPI(messageData);
}
function createNewEntry(event, sessionObj)
{

  var senderId = event.sender.id;
  var messageText, messageAttachments, payload;
  if(event.message) {
  	messageText = event.message.text;
  	messageAttachments = event.message.attachments;
  }
  if(event.postback) {
  	payload = event.postback.payload;
  }
  if(sessionObj.step == 1)
  {
  	  sessionObj.new_entry = new location({sender_id: senderId});
  	  sessionObj.markModified('new_entry');

  	  //console.log("*************************************************");
      //console.log(util.inspect(sessionObj, false, null));

      request({
        url: "https://graph.facebook.com/v2.6/" + senderId,
        qs: {
          access_token: process.env.PAGE_ACCESS_TOKEN,
          fields: "first_name"
        },
        method: "GET"
      }, function(error, response, body) {
        var startNewEntry = "";
        if (error) {
          console.log("Error getting user's name!");
          //console.log("Error getting user's name: " +  error);
        } else {
          var bodyObj = JSON.parse(body);
          name = bodyObj.first_name;
          startNewEntry = "Okay " + name + ", ";
        }
        var message = startNewEntry + "I will guide you through the process of adding a new entry."
        sendTextMessage(senderId, message);
      });

      var message = "Please enter the full name of the person that needs help.";
      sendTextMessage(senderId, message);
    }
    else if(sessionObj.step == 2)
    {
    	
		//console.log("+++++++++++++++++++++++++++++++++++++++++++++++++++++");
    	//console.log(util.inspect(sessionObj, false, null));
    	if(!messageText) {
    		sendTextMessage(senderId, "Invalid Input!");
    		getStarted(event, sessionObj);
    		return;
    	}
    	sessionObj.new_entry.name = messageText;
    	sessionObj.markModified('new_entry');

		var messageData = {
			recipient: {
				id: senderId
			},
			message: {
				text:"Please share the location of this call for help",
				quick_replies:[
					{
						content_type:"location",
					}
				]
			}
		};
		callSendAPI(messageData);
    }
    else if(sessionObj.step == 3)
    {
    	//console.log("---------------------------------------------------");
    	//console.log(util.inspect(messageAttachments, false, null));
    	if(!messageAttachments || !messageAttachments.length || messageAttachments[0].type != 'location') {
    		sendTextMessage(senderId, "Invalid Input!");
    		getStarted(event, sessionObj);
    		return;
    	}
    	sessionObj.new_entry.lat = messageAttachments[0].payload.coordinates.lat;
    	sessionObj.new_entry.long = messageAttachments[0].payload.coordinates.long;
    	sessionObj.markModified('new_entry');

		var message = "Please specify a description for this call for help.";
		sendTextMessage(senderId, message);
    }
    else if(sessionObj.step == 4)
    {
    	if(!messageText) {
    		sendTextMessage(senderId, "Invalid Input!");
    		getStarted(event, sessionObj);
    		return;
    	}
    	sessionObj.new_entry.description = messageText;
    	sessionObj.markModified('new_entry');
    
      var messageData = {
        recipient: {
          id: senderId
        },
        message: {
          text:"Please specify the priority of this call for help",
             quick_replies:[
               {
                 content_type:"text",
                 title: "High",
                 payload: "High"
               },
               {
                 content_type:"text",
                 title: "Medium",
                 payload: "Medium"

               },
               {
                  content_type:"text",
                  title: "Low",
                  payload: "Low"
               }
             ]
        }
      };
      callSendAPI(messageData);
    }
  else if(sessionObj.step == 5)
  {
  		if(!messageText) {
    		sendTextMessage(senderId, "Invalid Input!");
    		getStarted(event, sessionObj);
    		return;
    	}
    	sessionObj.new_entry.priority = messageText;
    	sessionObj.markModified('new_entry');

		// console.log("yeah baby");
		var message = "Okay, let's review this entry\n";
		message += "Full name: " + sessionObj.new_entry.name + "\n";
		message += "Description: " + sessionObj.new_entry.description + "\n";
		message += "Priority: " + sessionObj.new_entry.priority + "\n";
		sendTextMessage(senderId, message);

		var messageData = {
			recipient: {id: senderId},
			message: {
			    attachment: {
			        type: "template",
			        payload: {
			            template_type: "generic",
			            elements: [
			                {
			                	element: {
				                    title: "Location",
				                    image_url: "https:\/\/maps.googleapis.com\/maps\/api\/staticmap?size=764x400&center="+lat+","+long+"&zoom=25&markers="+lat+","+long,
				                    item_url: "http:\/\/maps.apple.com\/maps?q="+sessionObj.new_entry.lat+","+sessionObj.new_entry.long+"&z=16"
			              		}
			            	}
			            ]
			        }
			    }
			}
		}
		callSendAPI(messageData);

		messageData = {
		  recipient:{
		    id: senderId
		  },
		  message:{
		    attachment:{
		      type: "template",
		      payload:{
		        template_type:"button",
		        text:"Are you sure you want to add this entry?",
		        buttons:[
		        {
		          type:"postback",
		          title:"Yes",
		          payload:"ConfirmNewEntry"
		        },
		        {
		          type:"postback",
		          title:"No",
		          payload:"CancelNewEntry"
		        }
		        ]
		      }
		    }       
		  }
		}
		callSendAPI(messageData);
	}
	else{
		getStarted(event, sessionObj);
		return;
	}
 	++sessionObj.step;

 	//console.log("+++++++++++++++++++++++++++++++++++++++++++++++++++++");
    //console.log(util.inspect(sessionObj.new_entry, false, null));

	sessionObj.save(function(err) {
		if(err) {
			console.error("err happend during saving :", err);
		}
		else {
			console.log("sessionObj saved Successfully :", sessionObj);
		}
	});
}
function getStarted(event, sessionObj, flag = false)
{
  var senderId = event.sender.id;
  //var payload = event.postback.payload;
  if(flag) {
	  request({
	      url: "https://graph.facebook.com/v2.6/" + senderId,
	      qs: {
	        access_token: process.env.PAGE_ACCESS_TOKEN,
	        fields: "first_name"
	      },
	      method: "GET"
	    }, function(error, response, body) {
	      var greeting = "";
	      if (error) {
	        //console.log("Error getting user's name: " +  error);
	        console.log("Error getting user's name!");
	      } else {
	        var bodyObj = JSON.parse(body);
	        name = bodyObj.first_name;
	        greeting = "Hi " + name + "!\n";
	      }
	      var message = greeting + "This messanger bot allows you to reach poor people who need help in your area, and also add information about people who need help so other users can reach them too. Together, we can create a better world!";
	      sendTextMessage(senderId, message);
	    });
	}
    sendGenericMessage(senderId);
    //console.log("%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%5");
    //console.log(sessionObj);
    //console.log(event);
    //session.end(sessionObj);

}
function sendGenericMessage(recipientId, messageText) {
  var messageData = {
    recipient: {
      id: recipientId
    },
    message: {
      attachment: {
        type: "template",
        payload: {
          template_type: "generic",
          elements: [{
            title: "What do you want to do?",
            subtitle: "You can either add new calls for help, or list near calls for help",
            image_url: "https://cdn.pixabay.com/photo/2017/02/10/12/03/volunteer-2055010_960_720.png",
            buttons: [{
              type: "postback",
              title: "Add a call for help",
              payload: "NewEntry",
            }, {
              type: "postback",
              title: "List calls for help",
              payload: "ListEntries",
            }],
          }]
        }
      }
    }
  };  

  callSendAPI(messageData);
}

function sendTextMessage(recipientId, messageText) {
  var messageData = {
    recipient: {
      id: recipientId
    },
    message: {
      text: messageText
    }
  };

  callSendAPI(messageData);
}

function callSendAPI(messageData) {
  request({
    uri: 'https://graph.facebook.com/v2.6/me/messages',
    qs: { access_token: process.env.PAGE_ACCESS_TOKEN },
    method: 'POST',
    json: messageData

  }, function (error, response, body) {
    if (!error && response.statusCode == 200) {
      var recipientId = body.recipient_id;
      var messageId = body.message_id;

      console.log("Successfully sent generic message with id %s to recipient %s", 
        messageId, recipientId);
    } else {
      console.error("Unable to send message.");
      //console.error(response);
      //console.error(error);
    }
  });  
}



app.listen((process.env.PORT || 5000), function () {
	console.log("Server Started on Port %d", (process.env.PORT || 5000));
});

