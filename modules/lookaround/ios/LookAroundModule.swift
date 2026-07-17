import CoreLocation
import ExpoModulesCore
import MapKit
import UIKit

public final class AniseekrLookAroundModule: Module {
  private var activeSceneRequests: [UUID: MKLookAroundSceneRequest] = [:]

  public func definition() -> ModuleDefinition {
    Name("AniseekrLookAround")

    AsyncFunction("hasScene") { (latitude: Double, longitude: Double, promise: Promise) in
      guard let coordinate = makeCoordinate(latitude: latitude, longitude: longitude) else {
        promise.resolve(false)
        return
      }

      guard #available(iOS 16.0, *) else {
        promise.resolve(false)
        return
      }

      DispatchQueue.main.async {
        self.requestScene(for: coordinate) { scene in
          promise.resolve(scene != nil)
        }
      }
    }

    AsyncFunction("present") { (latitude: Double, longitude: Double, promise: Promise) in
      guard let coordinate = makeCoordinate(latitude: latitude, longitude: longitude) else {
        promise.reject(
          "ERR_LOOK_AROUND_INVALID_COORDINATE",
          "Look Around requires a finite latitude in [-90, 90] and longitude in [-180, 180]"
        )
        return
      }

      guard #available(iOS 16.0, *) else {
        promise.reject(
          "ERR_LOOK_AROUND_UNAVAILABLE",
          "Look Around requires iOS 16 or newer"
        )
        return
      }

      DispatchQueue.main.async {
        self.requestScene(for: coordinate) { scene in
          guard let scene else {
            promise.reject(
              "ERR_LOOK_AROUND_SCENE_UNAVAILABLE",
              "Look Around scene is unavailable for this coordinate"
            )
            return
          }

          guard let presenter = rootPresentingViewController() else {
            promise.reject(
              "ERR_LOOK_AROUND_NO_ROOT_VIEW_CONTROLLER",
              "Unable to find a root view controller to present Look Around"
            )
            return
          }

          let viewController = MKLookAroundViewController(scene: scene)
          viewController.modalPresentationStyle = .fullScreen
          viewController.isNavigationEnabled = true
          viewController.badgePosition = .topTrailing

          presenter.present(viewController, animated: true) {
            promise.resolve()
          }
        }
      }
    }

    View(LookAroundPreviewView.self) {
      ViewName("LookAroundPreviewView")
      Events("onSceneUnavailable")

      Prop("latitude") { (view: LookAroundPreviewView, latitude: Double?) in
        view.latitude = latitude
      }

      Prop("longitude") { (view: LookAroundPreviewView, longitude: Double?) in
        view.longitude = longitude
      }

      OnViewDidUpdateProps { (view: LookAroundPreviewView) in
        view.reloadSceneIfNeeded()
      }
    }

    OnDestroy {
      self.activeSceneRequests.values.forEach { $0.cancel() }
      self.activeSceneRequests.removeAll()
    }
  }

  @available(iOS 16.0, *)
  private func requestScene(
    for coordinate: CLLocationCoordinate2D,
    completion: @escaping (MKLookAroundScene?) -> Void
  ) {
    let token = UUID()
    let request = MKLookAroundSceneRequest(coordinate: coordinate)
    activeSceneRequests[token] = request

    request.getSceneWithCompletionHandler { [weak self] scene, _ in
      // MapKit does not guarantee a main-queue callback; activeSceneRequests
      // is only ever touched on main.
      DispatchQueue.main.async {
        self?.activeSceneRequests[token] = nil
        completion(scene)
      }
    }
  }
}

private func makeCoordinate(latitude: Double, longitude: Double) -> CLLocationCoordinate2D? {
  guard latitude.isFinite,
    longitude.isFinite,
    latitude >= -90,
    latitude <= 90,
    longitude >= -180,
    longitude <= 180
  else {
    return nil
  }

  return CLLocationCoordinate2D(latitude: latitude, longitude: longitude)
}

func rootPresentingViewController() -> UIViewController? {
  guard let root = UIApplication.shared.connectedScenes
    .compactMap({ $0 as? UIWindowScene })
    .flatMap(\.windows)
    .first(where: { $0.isKeyWindow })?
    .rootViewController
  else {
    return nil
  }

  return root.topMostPresentedViewController()
}

extension UIViewController {
  func topMostPresentedViewController() -> UIViewController {
    var viewController = self
    while let presentedViewController = viewController.presentedViewController {
      viewController = presentedViewController
    }
    return viewController
  }
}
