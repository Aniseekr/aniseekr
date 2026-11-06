require "json"

package = JSON.parse(File.read(File.join(__dir__, "package.json")))

Pod::Spec.new do |s|
  s.name         = "AniseekrCameraLook"
  s.version      = package["version"]
  s.summary      = package["description"]
  s.homepage     = "https://aniseekr.moe"
  s.license      = package["license"]
  s.authors      = "Aniseekr"
  s.platforms    = { :ios => min_ios_version_supported }
  s.source       = { :git => "https://github.com/Aniseekr/aniseekr.git" }

  s.source_files = ["ios/**/*.swift"]
  s.frameworks = ["AVFoundation", "CoreImage", "CoreMedia", "Metal"]

  load 'nitrogen/generated/ios/AniseekrCameraLook+autolinking.rb'
  add_nitrogen_files(s)

  s.dependency 'VisionCamera'
  s.dependency 'React-jsi'
  s.dependency 'React-callinvoker'
  install_modules_dependencies(s)
end
