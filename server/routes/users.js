import express from 'express';
import passport from '../config/passport';
import bcrypt from 'bcrypt';
import { Strategy as BearerStrategy } from 'passport-http-bearer';
import tokenGenerator from '../config/tokenGenerator';
import User from '../models/user';
import Playlist from '../models/playlist';
const usersRouter = express.Router();

function userResponse(user) {
  return {
      username: user.username,
      token: user.token,
      accessToken: user.accessToken,
      userId: user._id,
      favouritePlaylists: user.favouritePlaylists
  };
}

usersRouter
  .route('/')
  .get(passport.authenticate('bearer', { session: false }), (req, res) => {
    User.find({}, 'username token _id favouritePlaylists')
        .then(users => {
            return res.json(users);
        })
        .catch(err => res.sendStatus(500));
  })
  .post((req, res) => {
    if (!req.body.username || !req.body.password || !req.body.email) {
        return res.status(400).json({ message: 'Invalid input.' });
    }
    User.createUser(
      req.body.username,
      req.body.password,
      req.body.email,
      tokenGenerator(34)
    )
    .then(user => {
        res.set('Location', `/api/v1/users/${user.username}`);
        return res.status(201).json({ user: userResponse(user), playlist: [] });
    })
    .catch(err => {
        console.error(err);
        if (err.status === 400) return res.status(400).json({ message: err.message });
        return res.sendStatus(500);
    });
  })

//Change username or password
//If the user wants to change username,currentUsername and newUsername will be sent to us in JSON format and accessToken via query
//If the user wants to change the password, current and new password will be sent to us in JSON format and accessToken via query
  .put(passport.authenticate('bearer', { session: false }), (req, res) => {
    if (req.body.currentUsername && req.body.newUsername) {
      if (req.body.currentUsername === req.body.newUsername) {
          return res.json({ message: 'New username is same as the current username.' });
      }
    }
    if (req.body.newUsername) {
        User.findOneAndUpdate(
          { accessToken: req.query.access_token }, 
          { username: req.body.newUsername }, 
          { new: true }
        )
        .then(user => {
          if (!user) return res.status(404).json({ message: 'User not found.' });
          return res.json(userResponse(user));
        })
        .catch(() => res.sendStatus(500));
    }
    if (req.body.newPassword) {
      User.findOne({ accessToken: req.query.access_token },
        (err, user) => {
          bcrypt.genSalt(10, (err, salt) => {
              bcrypt.hash(req.body.newPassword, salt,
                  (err, hashNewPassword) => {
                      User.findOneAndUpdate(
                        { accessToken: req.query.access_token }, 
                        { password: hashNewPassword }, 
                        { new: true }
                      )
                      .then(user => {
                        if (!user) return res.status(404).json({ message: 'User not found.' });
                        return res.json({ message: 'Your password has been changed successfully.' });
                      })
                      .catch(() => res.sendStatus(500));
                  }
              );
          });
        }
      );
    }
    if (!req.body.newUsername && !req.body.newPassword) {
        return res.status(404).json({ message: 'Invalid input' });
    }
  });


usersRouter
    .route('/:token')

.get(passport.authenticate('bearer', { session: false }), (req, res) => {
    User.findOne({ token: req.params.token })
        .then(user => {
            if (!user) return res.status(404).json({ message: 'User not found' });
            if (req.query.access_token === user.accessToken) {
                Playlist.find({ userId: user._id }).then(playlist => {
                    return res.json({ user: userResponse(user), playlist: playlist });
                });
            } else {
                //The else statement runs when an user checks out another user's playlist
                Playlist.find({ userId: user._id, isPublic: true })
                    .then(playlist => {
                        return res.json({
                            username: user.username,
                            userId: user._id,
                            playlist: playlist
                        });
                    });
            }
        })
        .catch(err => res.sendStatus(500));
})

//when user selects a playlist to be added or to be deleted from his fouritePlaylist array
//playlist id and rating should be supplied in req.body
.put(passport.authenticate('bearer', { session: false }), (req, res) => {
    User.findOne({ token: req.params.token })
        .then(user => {
            if (!user) return res.status(404).json({ message: 'User not found' });
            if (user.favouritePlaylists.indexOf(req.body.playlistId) === -1 && (req.body.rating)) {
                let newRating = req.body.rating + 1;
                const newFavouritePlaylist = user.favouritePlaylists;
                newFavouritePlaylist.push(req.body.playlistId);
                User.findOneAndUpdate({ token: req.params.token }, { favouritePlaylists: newFavouritePlaylist }, { new: true })
                    .then(user => {
                        Playlist.findOneAndUpdate({ _id: req.body.playlistId }, { rating: newRating }, { new: true })
                            .then(playlist => {
                                return res.status(200).json({ user: userResponse(user), playlist: playlist });
                            });
                    });
            } else {
                let newRating = req.body.rating - 1;
                const newFavouritePlaylist = user.favouritePlaylists;
                newFavouritePlaylist.splice(user.favouritePlaylists.indexOf(req.body.playlistId), 1);
                User.findOneAndUpdate({ token: req.params.token }, { favouritePlaylists: newFavouritePlaylist }, { new: true })
                    .then(user => {
                        Playlist.findOneAndUpdate({ _id: req.body.playlistId }, { rating: newRating }, { new: true })
                            .then(playlist => {
                                return res.status(200).json({ user: userResponse(user), playlist: playlist });
                            });
                    });
            }
        })
        .catch(err => res.sendStatus(500));
});


usersRouter
    .route('/login/:token')

.get(passport.authenticate('basic', { session: false }), (req, res) => {
    User.findOne({ token: req.params.token })
        .then(user => {
            Playlist.find({ userId: user._id }).then(playlist => {
                return res.json({ user: userResponse(user), playlist: playlist });
            })
        })
        .catch(err => res.sendStatus(500));
});


usersRouter
    .route('/favouriteplaylists/:userId')
    .put(passport.authenticate('bearer', { session: false }), (req, res) => {
        console.log(req.body.playlistId);
        let playlistId = req.body.playlistId;
        User.findByIdAndUpdate(
            req.params.userId, { $push: { favouritePlaylists: req.body.playlistId } }, { safe: true, upsert: true },
            (err, user) => {
                res.json(user);
            }
        )

        User.findOne({ _id: req.params.userId }).exec((err, user) => {
            User.populate(user, 'favouritePlaylists.playlistId', (err, user) => {
                console.log(user)
            })
        })

        // .then(user => {
        //   console.log(user)
        // });
    })

.get(passport.authenticate('bearer', { session: false }), (req, res) => {
    let playlistArr = [];
    User.findOne({ _id: req.params.userId })
        .then(user => {
            let favouritePlaylistsArr = user.favouritePlaylists;
            favouritePlaylistsArr.forEach((element) => {
                Playlist.find({ _id: element }).then(playlist => {
                    console.log(playlist);
                    playlistArr.push({
                        _id: playlist._id
                    });
                })
            })
            console.log(playlistArr);
            // for(var i = 0; i < favouritePlaylistsArr.length; i++) {
            //   Playlist.find({_id: favouritePlaylistsArr[i]}).then(playlist => {
            //     playlistArr[i] = playlist;
            //   })
            // }

            // console.log(playlistArr);
            // Playlist.find({userId: user._id}).then(playlist => {
            //   return res.json({user:userResponse(user), playlist: playlist});
            // })
        })
        .catch(err => res.sendStatus(500));
})

passport.use(
    new BearerStrategy(
        function(accessToken, done) {
            User.findOne({
                    accessToken: accessToken,
                },
                function(err, user) {
                    console.log(user);
                    if (err) {
                        return done(err);
                    }
                    if (!user) {
                        return done(null, false);
                    }

                    return done(null, user, {
                        scope: 'all'
                    });
                }
            );
        }
    )
);


export default usersRouter;
