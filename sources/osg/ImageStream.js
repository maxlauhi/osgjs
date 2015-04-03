define( [
    'q',
    'osg/Utils',
    'osg/Image'
], function ( Q, MACROUTILS, Image ) {

    'use strict';

    var ImageStream = function ( video ) {
        Image.call( this, video );
        this._canPlayDefered = undefined;
    };

    ImageStream.PAUSE = 0;
    ImageStream.PLAYING = 1;

    ImageStream.prototype = MACROUTILS.objectLibraryClass( MACROUTILS.objectInherit( Image.prototype, {

        isDirty: function () {
            return this._status === ImageStream.PLAYING; // video is dirty if playing
        },

        setImage: function( video ) {
            Image.prototype.setImage.call(this, video);

            this._status = ImageStream.STOP;

            // event at the end of the stream
            video.addEventListener( 'ended', function () {
                this._status = ImageStream.PAUSE;
            }.bind( this ), true );

            this.dirty();
        },

        play: function () {
            this._imageObject.play();
            this._status = ImageStream.PLAYING;
        },

        stop: function () {
            this._imageObject.pause();
            this._status = ImageStream.PAUSE;
        },

        whenReady: function () {

            if ( !this._imageObject )
                return Q( false );

            if ( !this._canPlayDefered ) {
                this._canPlayDefered = Q.defer();
                this._imageObject.addEventListener(
                    'canplaythrough',
                    function () {
                        this._canPlayDefered.resolve( this );
                    }.bind( this ),

                    true );
            }

            return this._canPlayDefered.promise;
        }


    } ), 'osg', 'ImageStream' );

    MACROUTILS.setTypeID( ImageStream );

    return ImageStream;
} );
