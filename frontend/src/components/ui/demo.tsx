import React, { useState } from "react";
import { i18n } from "../../translate/i18n";
import BrandPanel from "../LoginExperience/BrandPanel";
import { SignInPage } from "./sign-in";
import "./sign-in.css";

/**
 * Optional local/documentation example, deliberately not registered as an app route.
 * It has no authentication, API calls, credential logging, alerts or testimonials.
 * The production Login supplies its existing authentication handlers instead.
 */
export default function SignInDemo() {
  const [values, setValues] = useState({
    email: "",
    password: "",
    newPassword: "",
    confirmPassword: ""
  });

  return (
    <SignInPage
      values={values}
      onFieldChange={event => {
        const { name, value } = event.target;
        if (Object.prototype.hasOwnProperty.call(values, name)) {
          setValues(current => ({ ...current, [name]: value }));
        }
      }}
      onSignIn={event => event.preventDefault()}
      hero={<BrandPanel />}
      footer={
        <p role="note">
          {i18n.t("loginExperience.demoNotice", {
            defaultValue:
              "Demonstração visual: este exemplo não autentica nem salva dados."
          })}
        </p>
      }
    />
  );
}
