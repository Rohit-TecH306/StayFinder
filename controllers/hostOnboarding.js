const { userIsHost } = require("../middleware.js");

module.exports.renderOnboarding = async (req, res) => {
  if (await userIsHost(req.user)) {
    req.flash("success", "You are already set up to host.");
    return res.redirect("/listings/new");
  }

  const formData = req.session && req.session.hostFormData;
  if (req.session) delete req.session.hostFormData;
  res.render("host/onboard.ejs", { formData: formData || {} });
};

module.exports.completeOnboarding = async (req, res) => {
  if (await userIsHost(req.user)) {
    return res.redirect("/listings/new");
  }

  const { fullName, phone, city, propertyType } = req.validatedHostOnboarding;

  req.user.hostFullName = fullName;
  req.user.hostPhone = phone;
  req.user.hostCity = city;
  req.user.hostPropertyType = propertyType;
  req.user.hostTermsAccepted = true;
  req.user.hostTermsAcceptedAt = new Date();
  req.user.hostOnboardingCompleted = true;
  await req.user.save();

  req.flash("success", "Welcome, host! Create your first listing to get started.");
  res.redirect("/listings/new");
};
