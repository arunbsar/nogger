const bcrypt = require('bcryptjs');
const db = require('./db');

const Users = db.Users;
const Logins = db.Logins;
const saltRounds = 12;
const maxLoginAttempts = 10;
const loginAttemptCountTimeout = 5 * 60 * 1000;

exports.login = data => new Promise((resolve, reject) => {
  if (!data || !data.username || !data.password) {
    reject(new Error('Auth - No username or password provided'));
    return;
  }
  const username = data.username.toLowerCase();

  Logins.count(
    {
      username,
      date: {
        $gt: Date.now() - loginAttemptCountTimeout,
      },
    },
    (loginsErr, logins) => {
      if (loginsErr) {
        console.log('error checking login attempts', loginsErr);
      } else if (logins > maxLoginAttempts) {
        reject(new Error('Auth - too many logins. Try again later'));
      }
      Users.findOne({ username }, (err, user) => {
        if (err) {
          reject(err);
          return;
        }
        if (!user) {
          reject(new Error('Auth - User not found'));
          return;
        }
        bcrypt.compare(data.password, user.password, (hashErr, success) => {
          if (hashErr) {
            reject(hashErr);
            return;
          }
          if (success) {
            resolve(user);
          } else {
            reject(new Error('Auth - Wrong password'));
          }
        });
      });

      Logins.insert({
        username,
        date: Date.now(),
      }, (err) => {
        if (err) {
          console.log('error saving login attempt', err);
        }
      });
    });
});

exports.register = data => new Promise((resolve, reject) => {
  if (!data || !data.username || !data.password) {
    reject(new Error('No username or password provided'));
    return;
  }
  const username = data.username.toLowerCase();
  Users.findOne({ username }, (findErr, user) => {
    if (user) {
      reject(new Error('User exists already'));
      return;
    }
    bcrypt.hash(data.password, saltRounds, (err, hash) => {
      if (err) {
        reject(err);
        return;
      }
      Users.insert({
        username,
        password: hash,
      }, (insertErr) => {
        if (insertErr) {
          reject(insertErr);
          return;
        }
        resolve();
      });
    });
  });
});

exports.changePassword = data => new Promise((resolve, reject) => {
  if (!data || !data.username || !data.password) {
    reject(new Error('No username or password provided'));
    return;
  }
  const username = data.username.toLowerCase();
  Users.findOne({ username }, (findErr, user) => {
    if (!user) {
      reject(new Error('User does not exist'));
      return;
    }
    bcrypt.hash(data.password, saltRounds, (err, hash) => {
      if (err) {
        reject(err);
        return;
      }
      Users.update(
        {
          username,
        },
        {
          $set: { password: hash },
        }, (insertErr) => {
          if (insertErr) {
            reject(insertErr);
            return;
          }
          resolve();
        });
    });
  });
});
