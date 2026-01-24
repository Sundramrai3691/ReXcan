import { useAuth } from '../contexts/AuthContext';

const Profile = () => {
  const { user, logout } = useAuth();

  return (
    <div className="min-h-screen bg-gradient-to-b from-rexcan-light-grey-secondary via-white to-white">
      <div className="container mx-auto px-6 py-20">
        <div className="max-w-4xl mx-auto">
          {/* Header Section */}
          <div className="text-center mb-12">
            <div className="inline-flex items-center justify-center w-32 h-32 rounded-full bg-gradient-to-br from-rexcan-dark-blue-primary via-rexcan-dark-blue-secondary to-rexcan-bright-cyan-primary mb-6 shadow-2xl">
              <span className="text-5xl text-[#002D62] font-bold">
                {user?.name?.charAt(0).toUpperCase() || 'U'}
              </span>
            </div>
            <h1 
              className="text-5xl md:text-6xl font-bold mb-4"
              style={{
                background: 'linear-gradient(135deg, #002D62 0%, #00FFD8 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text'
              }}
            >
              Profile
            </h1>
            <p className="text-xl text-[#191970]">
              Welcome back, <span className="font-semibold text-[#002D62]">{user?.name}</span>
            </p>
          </div>

          {/* Account Information Card */}
          <div className="bg-white rounded-2xl shadow-2xl p-8 md:p-10 mb-8 border border-[#EAEAEA]">
            <div className="flex items-center justify-between mb-8 pb-6 border-b border-[#EAEAEA]">
              <h2 
                className="text-3xl font-bold"
                style={{
                  background: 'linear-gradient(135deg, #002D62 0%, #191970 100%)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  backgroundClip: 'text'
                }}
              >
                Account Information
              </h2>
              {user?.isEmailVerified && (
                <span className="px-4 py-2 rounded-full text-sm font-semibold bg-green-100 text-green-700">
                  ✓ Verified
                </span>
              )}
            </div>

            <div className="grid md:grid-cols-2 gap-8">
              {/* Name Field */}
              <div className="space-y-2">
                <label className="text-sm font-semibold uppercase tracking-wider text-[#002D62]/60">
                  Full Name
                </label>
                <div className="p-4 rounded-xl bg-gradient-to-br from-[#002D62]/5 to-[#00FFD8]/5 border border-[#EAEAEA]">
                  <p className="text-xl font-semibold text-[#002D62]">{user?.name}</p>
                </div>
              </div>

              {/* Email Field */}
              <div className="space-y-2">
                <label className="text-sm font-semibold uppercase tracking-wider text-[#002D62]/60">
                  Email Address
                </label>
                <div className="p-4 rounded-xl bg-gradient-to-br from-[#002D62]/5 to-[#00FFD8]/5 border border-[#EAEAEA]">
                  <p className="text-xl font-semibold text-[#002D62]">{user?.email}</p>
                </div>
              </div>

              {/* Role Field */}
              <div className="space-y-2">
                <label className="text-sm font-semibold uppercase tracking-wider text-[#002D62]/60">
                  Account Role
                </label>
                <div className="p-4 rounded-xl bg-gradient-to-br from-[#002D62]/5 to-[#00FFD8]/5 border border-[#EAEAEA]">
                  <span 
                    className="inline-block px-4 py-2 rounded-lg text-lg font-semibold capitalize"
                    style={{
                      backgroundColor: user?.role === 'admin' ? '#00FFD8' : '#002D62',
                      color: user?.role === 'admin' ? '#002D62' : '#FFFFFF'
                    }}
                  >
                    {user?.role}
                  </span>
                </div>
              </div>

              {/* Email Verification Status */}
              <div className="space-y-2">
                <label className="text-sm font-semibold uppercase tracking-wider text-[#002D62]/60">
                  Verification Status
                </label>
                <div className="p-4 rounded-xl bg-gradient-to-br from-[#002D62]/5 to-[#00FFD8]/5 border border-[#EAEAEA]">
                  {user?.isEmailVerified ? (
                    <span className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-lg font-semibold bg-green-100 text-green-700">
                      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                      </svg>
                      Email Verified
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-lg font-semibold bg-orange-100 text-orange-700">
                      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                      </svg>
                      Not Verified
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Logout Button */}
          <div className="flex justify-center">
            <button
              onClick={logout}
              className="px-8 py-4 rounded-xl font-semibold text-lg text-white hover:shadow-xl hover:scale-105 transition-all duration-300 bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700"
            >
              Logout
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Profile;
