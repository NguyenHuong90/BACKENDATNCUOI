// src/config/passport.js - FILE MỚI (Google OAuth config)

const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const User = require('../models/User');

passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: '/api/auth/google/callback', // tương đối vì mount ở /api/auth
      passReqToCallback: true,
    },
    async (req, accessToken, refreshToken, profile, done) => {
      try {
        // Tìm user bằng googleId trước
        let user = await User.findOne({ googleId: profile.id });

        if (user) {
          // Đã có tài khoản Google → cập nhật avatar nếu cần
          if (profile.photos && profile.photos[0]?.value) {
            user.avatar = profile.photos[0].value;
          }
          await user.save();
          return done(null, user);
        }

        // Chưa có → kiểm tra email có bị trùng với tài khoản local không
        const existingUser = await User.findOne({ email: profile.emails[0].value });
        if (existingUser) {
          return done(null, false, { message: 'Email này đã được dùng để đăng ký tài khoản thường' });
        }

        // Tạo user mới từ Google
        user = new User({
          googleId: profile.id,
          isGoogleUser: true,
          username: profile.emails[0].value.split('@')[0] + Math.floor(Math.random() * 10000), // tránh trùng
          email: profile.emails[0].value,
          firstName: profile.name.givenName || 'User',
          lastName: profile.name.familyName || 'Google',
          avatar: profile.photos && profile.photos[0]?.value,
          contact: 'Chưa cung cấp',
          address1: 'Chưa cung cấp',
          role: 'user',
        });

        await user.save();
        return done(null, user);
      } catch (err) {
        return done(err);
      }
    }
  )
);

// Lưu user vào session
passport.serializeUser((user, done) => {
  done(null, user._id);
});

passport.deserializeUser(async (id, done) => {
  try {
    const user = await User.findById(id);
    done(null, user);
  } catch (err) {
    done(err);
  }
});

module.exports = passport;
