/* jshint node: true */
'use strict';

var express = require( 'express' ),
    sessions = require( 'client-sessions' ),
    app = express(),
    visualCaptcha,
    _getAudio,
    _getImage,
    _startRoute,
    _trySubmission;

app.configure( function() {
    // Set session information
    app.use( express.cookieParser() );
    app.use(
        sessions( {
            cookieName: 'session',
            secret: 'someRandomSecret',
            duration: 86400000,// 24h in milliseconds
            cookie: {
                path: '/',
                httpOnly: true,
                secure: false,
                ephemeral: false
            }
        } )
    );

    // Enable CORS
    app.use( function( req, res, next ) {
        res.header( 'Access-Control-Allow-Origin', '*' );
	res.header( 'Access-Control-Allow-Methods', 'POST, GET, OPTIONS' );
    	res.header( 'Access-Control-Allow-Headers', 'accept, content-type' );
    	res.header( 'Access-Control-Allow-Credentials', true );
	res.header( 'Access-Control-Expose-Headers', 'X-Location' );
        next();
    } );

    app.use( express.bodyParser() );

    // Set public path
    app.use( express.static( __dirname + '/public' ) );
} );

// Define routes functions
// Fetches and streams an audio file
_getAudio = function( req, res, next ) {
    // Default file type is mp3, but we need to support ogg as well
    if ( req.params.type !== 'ogg' ) {
        req.params.type = 'mp3';
    }

    visualCaptcha.streamAudio( res, req.params.type );
};

// Fetches and streams an image file
_getImage = function( req, res, next ) {
    var isRetina = false;

    // Default is non-retina
    if ( req.query.retina ) {
        isRetina = true;
    }

    visualCaptcha.streamImage( req.params.index, res, isRetina );
};

// Start and refresh captcha options
_startRoute = function( req, res, next ) {

    // After initializing visualCaptcha, we only need to generate new options
    if ( ! visualCaptcha ) {
        visualCaptcha = require( 'visualcaptcha' )( req.session, req.query.namespace );
    }
    visualCaptcha.generate( req.params.howmany );

    // We have to send the frontend data to use on POST.
    res.send( 200, visualCaptcha.getFrontendData() );
};

// Try to validate the captcha
// We need to make sure we generate new options after trying to validate, to avoid abuse
_trySubmission = function( req, res, next ) {
    var namespace = req.query.namespace,
        frontendData,
        queryParams = [],
        imageAnswer,
        audioAnswer,
        responseStatus,
        status,
        result = {};

    frontendData = visualCaptcha.getFrontendData();

    // Add namespace to result, if present
    if ( namespace && namespace.length !== 0 ) {
        result.namespace = namespace;
    }

    // It's not impossible this method is called before visualCaptcha is initialized,
    // so we have to send a 404
    if ( typeof frontendData === 'undefined' ) {
        result.status = 'noCaptcha';

        responseStatus = 404;
    } else {
        // If an image field name was submitted, try to validate it
        if ( ( imageAnswer = req.body[ frontendData.imageFieldName ] ) ) {
            result.type = 'image';
            if ( visualCaptcha.validateImage( imageAnswer ) ) {
                result.status = 'valid';
                responseStatus = 200;
            } else {
                result.status = 'invalid';
                responseStatus = 403;
            }
        } else if ( ( audioAnswer = req.body[ frontendData.audioFieldName ] ) ) {
            // If an audio field name was submitted, try to validate it
            result.type = 'audio';
            // We set lowercase to allow case-insensitivity, but it's actually optional
            if ( visualCaptcha.validateAudio( audioAnswer.toLowerCase() ) ) {
                result.status = 'valid';
                responseStatus = 200;
            } else {
                result.status = 'invalid';
                responseStatus = 403;
            }
        } else {
            result.status = 'failedPost';
            responseStatus = 500;
        }
    }

    // CORS fix
    res.header( 'Access-Control-Allow-Origin', '*' );
    res.header( 'Access-Control-Allow-Credentials', true );

    res.send( responseStatus, {
        captcha: result
    });
};

// Routes definition


app.post( '/try', _trySubmission );

// @param type is optional and defaults to 'mp3', but can also be 'ogg'
app.get( '/audio', _getAudio );
app.get( '/audio/:type', _getAudio );

// @param index is required, the index of the image you wish to get
app.get( '/image/:index', _getImage );

// @param howmany is required, the number of images to generate
app.get( '/start/:howmany', _startRoute );

module.exports = app;

// API Listening Port
app.listen( process.env.PORT || 8282 );
